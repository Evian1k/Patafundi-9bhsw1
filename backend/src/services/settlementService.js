// settlementService.js — server-authoritative escrow release + company settlements.
// Single source of truth for the money flow after customer confirmation:
//   payment(held) → escrow release → fundi wallet credit OR company settlement
//   → revenue ledger → audit. Used by auto-release (customer confirmation)
//   and by the admin manual release path.
import { transaction } from '../db.js';
import { auditLog } from './auditService.js';
import { transitionJobInTransaction } from './jobStateMachine.js';

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Persist an idempotent settlement task in the existing PostgreSQL queue. */
export async function enqueueSettlementRelease(client, { jobId, paymentId = null, source = 'customer_confirmation' }) {
  if (!client?.query || !jobId) throw new Error('A transaction client and jobId are required');
  const result = await client.query(
    `select status, customer_completion_confirmed, escrow_status
       from jobs where id = $1 for update`,
    [jobId],
  );
  const job = result.rows[0];
  if (!job || !job.customer_completion_confirmed || job.escrow_status === 'released'
      || !['payment_pending', 'customer_confirmed_completion', 'completed'].includes(job.status)) {
    return false;
  }

  const idempotencyKey = paymentId
    ? `settlement_release:${jobId}:payment:${paymentId}`
    : `settlement_release:${jobId}:completion`;
  await client.query(
    `insert into job_queue (queue_name, payload, priority, idempotency_key)
     values ('settlement_release', $1::jsonb, 20, $2)
     on conflict (idempotency_key) where idempotency_key is not null
     do update set status = 'pending', attempts = 0, error_message = null,
       next_run_at = null, scheduled_at = now(), started_at = null, completed_at = null
     where job_queue.status in ('failed', 'completed')`,
    [JSON.stringify({ jobId, paymentId, source }), idempotencyKey],
  );
  return true;
}

/**
 * Release held escrow for a completed + customer-confirmed job.
 * Idempotent: if the payment is not in 'held' escrow the function is a no-op.
 * Company jobs produce a company_settlements row (pending payout);
 * individual jobs credit the fundi wallet and create a payout record.
 */
export async function releaseJobEscrow({ jobId, paymentId = null, actorId = null, actorRole = 'system', source = 'customer_confirmation' }) {
  const released = await transaction(async (client) => {
    const jobRes = await client.query('select * from jobs where id = $1 for update', [jobId]);
    let job = jobRes.rows[0];
    if (!job) throw new Error('Job not found');
    if (!['payment_pending', 'customer_confirmed_completion', 'completed'].includes(job.status) || !job.customer_completion_confirmed) {
      throw new Error('Escrow can only be released after customer-confirmed completion');
    }
    if (job.escrow_status === 'released') {
      return { released: false, reason: 'already_released', job };
    }
    if (job.status === 'customer_confirmed_completion') {
      job = await transitionJobInTransaction(client, {
        jobId,
        toStatus: 'payment_pending',
        actor: { id: actorId, role: actorRole },
        actorKind: 'system',
        skipActorCheck: true,
        metadata: { source, completionConfirmed: true },
      });
    }
    const disputeRes = await client.query(
      `select id from disputes where job_id = $1 and status in ('open', 'under_review') limit 1`,
      [jobId],
    );
    if (disputeRes.rows[0]) throw new Error('Escrow cannot be released while a dispute is open');

    const paymentRes = await client.query(
      `select * from payments
       where job_id = $1 and escrow_status = 'held' and ($2::uuid is null or id = $2)
       order by created_at desc limit 2 for update`,
      [jobId, paymentId],
    );
    if (!paymentId && paymentRes.rows.length > 1) {
      throw new Error('Multiple held payments require finance reconciliation; refusing ambiguous settlement');
    }
    const payment = paymentRes.rows[0];
    if (!payment) return { released: false, reason: 'no_held_escrow', job };

    // ── Server-authoritative split (never trust client values) ──
    const jobValue = money(job.final_price || job.estimated_price || payment.amount);
    const commissionRate = Number(
      payment.commission_rate != null ? payment.commission_rate : 0.15,
    );
    const commissionAmount = money(jobValue * commissionRate);
    const providerAmount = money(jobValue - commissionAmount);
    const currency = payment.currency_code || job.currency_code || 'KES';

    // 1. escrow release transaction (status must be 'released' — the value the
    //    wallet-balance query filters on)
    await client.query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       select $1, $2, 'release', $3, 'released'
       where not exists (
         select 1 from escrow_transactions where payment_id = $2 and type = 'release'
       )`,
      [jobId, payment.id, providerAmount],
    );

    // 2. payment + job + escrow account state
    await client.query(
      `update payments set escrow_status = 'released', status = 'completed', updated_at = now() where id = $1`,
      [payment.id],
    );
    await client.query(
      `update escrow_accounts set balance = 0, status = 'payout_processing', updated_at = now() where job_id = $1`,
      [jobId],
    );
    await client.query(
      `update jobs set escrow_status = 'released', payment_status = 'payout_processing', updated_at = now() where id = $1`,
      [jobId],
    );

    let settlement = null;
    let payout = null;
    let notificationTarget = null;

    if (job.company_id) {
      // ── Company settlement (company keeps its own technician payroll) ──
      const existing = await client.query(
        `select * from company_settlements where job_id = $1 limit 1`,
        [jobId],
      );
      if (existing.rows[0]) {
        settlement = existing.rows[0];
      } else {
        const inserted = await client.query(
          `insert into company_settlements
             (company_id, job_id, payment_id, gross_amount, commission_amount, net_amount, status)
           values ($1, $2, $3, $4, $5, $6, 'pending')
           returning *`,
          [job.company_id, jobId, payment.id, jobValue, commissionAmount, providerAmount],
        );
        settlement = inserted.rows[0];
      }
    } else if (job.fundi_id) {
      // ── Individual fundi wallet credit ──
      await client.query(
        `insert into fundi_wallets (fundi_id, available_balance, total_earned)
         values ($1, $2, $2)
         on conflict (fundi_id) do update set
           available_balance = fundi_wallets.available_balance + $2,
           total_earned = fundi_wallets.total_earned + $2,
           updated_at = now()`,
        [job.fundi_id, providerAmount],
      );
      const balRes = await client.query(
        `select available_balance from fundi_wallets where fundi_id = $1`,
        [job.fundi_id],
      );
      await client.query(
        `insert into wallet_transactions (fundi_id, job_id, type, amount, balance_after, reason)
         values ($1, $2, 'credit', $3, $4, 'Job payment — platform commission deducted')`,
        [job.fundi_id, jobId, providerAmount, balRes.rows[0]?.available_balance ?? providerAmount],
      );
      // payout record (processing — admin completes the transfer)
      const payoutRes = await client.query(
        `insert into payouts (job_id, fundi_id, amount, status, net_amount, currency, protection_snapshot)
         select $1, $2, $3, 'processing', $3, $4, $5::jsonb
         where not exists (
           select 1 from payouts where job_id = $1 and status in ('requested', 'processing', 'completed')
         )
         returning *`,
        [jobId, job.fundi_id, providerAmount, currency,
         JSON.stringify({ source, platformCommission: commissionAmount })],
      );
      payout = payoutRes.rows[0] || null;
    }

    // 3. revenue ledger (platform commission earned) — 005 entry_type + 029
    // transaction_type column families coexist, so write both.
    await client.query(
      `insert into revenue_ledger (payment_id, job_id, user_id, entry_type, amount, currency,
        transaction_type, customer_paid, commission_amount, platform_fee_amount, fundi_payout,
        net_revenue, payment_method, notes)
       values ($1, $2, $3, 'commission', $4, $5, 'commission_earned', $6, $4, $4, $7, $4, $8, $9)`,
      [payment.id, jobId, job.customer_id, commissionAmount, currency, jobValue, providerAmount,
       payment.provider || 'mpesa',
       `Escrow released via ${source}`],
    );

    // The payment and escrow release are verified, but a separate provider
    // payout can still be processing. Complete the job without claiming that
    // the payout itself has completed.
    const completedJob = job.status === 'completed' ? job : await transitionJobInTransaction(client, {
      jobId,
      toStatus: 'completed',
      actor: { id: actorId, role: actorRole },
      actorKind: 'system',
      skipActorCheck: true,
      metadata: { source, escrowReleased: true },
    });
    await client.query(
      `insert into job_timeline (job_id, event_type, actor_id, actor_role, metadata)
       values ($1, 'escrow_released', $2, $3, $4::jsonb)`,
      [jobId, actorId, actorRole, JSON.stringify({ paymentId: payment.id, source })],
    );

    // Durable notifications and the audit record commit with the financial
    // ledger. The queue can safely treat an already-released payment as done.
    if (settlement) {
      const owner = await client.query(
        `select owner_user_id from company_profiles where id = $1`,
        [settlement.company_id],
      );
      if (owner.rows[0]?.owner_user_id) {
        notificationTarget = { type: 'company', userId: owner.rows[0].owner_user_id };
        await client.query(
          `insert into notifications (user_id, type, title, body, data)
           values ($1, 'settlement_created', 'Settlement Created', $2, $3::jsonb)`,
          [notificationTarget.userId,
           `${currency} ${Number(settlement.net_amount).toLocaleString()} has been added to your pending settlements.`,
           JSON.stringify({ jobId, settlementId: settlement.id })],
        );
      }
    } else if (job.fundi_id) {
      notificationTarget = { type: 'fundi', userId: job.fundi_id };
      await client.query(
        `insert into notifications (user_id, type, title, body, data)
         values ($1, 'payment_received', 'Payment Received', $2, $3::jsonb)`,
        [job.fundi_id,
         `${currency} ${providerAmount.toLocaleString()} has been credited to your wallet for the completed job.`,
         JSON.stringify({ jobId, amount: providerAmount })],
      );
    }
    await auditLog({
      client,
      userId: actorId,
      action: 'escrow.release',
      entityType: 'job',
      entityId: jobId,
      metadata: {
        source,
        actorRole,
        paymentId: payment.id,
        commission: commissionAmount,
        providerAmount,
        settlementId: settlement?.id || null,
        payoutId: payout?.id || null,
      },
    });

    return {
      released: true,
      jobValue,
      commissionAmount,
      providerAmount,
      currency,
      settlement,
      payout,
      payment,
      job: completedJob,
      notificationTarget,
    };
  });

  if (!released.released) return released;

  // ── Post-transaction: ephemeral realtime events only ──
  const { emitEvent } = await import('../realtime.js');
  try {
    if (released.notificationTarget?.type === 'company') {
      emitEvent('payment:confirmed', { jobId, settlement: released.settlement }, `user:${released.notificationTarget.userId}`);
    } else if (released.notificationTarget?.type === 'fundi') {
      emitEvent('payment:confirmed', { jobId, fundiEarnings: released.providerAmount }, `user:${released.notificationTarget.userId}`);
    }
    emitEvent('escrow:released', { jobId, amount: released.providerAmount }, `job:${jobId}`);
    emitEvent('job:status', { jobId, status: 'completed' }, `job:${jobId}`);
    emitEvent('job:completed', { jobId }, `job:${jobId}`);
  } catch (error) {
    console.error('[settlement] Realtime event failed after committed settlement', { jobId, message: error.message });
  }

  return released;
}
