// settlementService.js — server-authoritative escrow release + company settlements.
// Single source of truth for the money flow after customer confirmation:
//   payment(held) → escrow release → fundi wallet credit OR company settlement
//   → revenue ledger → audit. Used by auto-release (customer confirmation)
//   and by the admin manual release path.
import { transaction, query } from '../db.js';
import { auditLog } from './auditService.js';

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Release held escrow for a completed + customer-confirmed job.
 * Idempotent: if the payment is not in 'held' escrow the function is a no-op.
 * Company jobs produce a company_settlements row (pending payout);
 * individual jobs credit the fundi wallet and create a payout record.
 */
export async function releaseJobEscrow({ jobId, actorId = null, actorRole = 'system', source = 'customer_confirmation' }) {
  const released = await transaction(async (client) => {
    const jobRes = await client.query('select * from jobs where id = $1 for update', [jobId]);
    const job = jobRes.rows[0];
    if (!job) throw new Error('Job not found');
    if (job.status !== 'completed' || !job.customer_completion_confirmed) {
      throw new Error('Escrow can only be released after customer-confirmed completion');
    }
    const disputeRes = await client.query(
      `select id from disputes where job_id = $1 and status in ('open', 'under_review') limit 1`,
      [jobId],
    );
    if (disputeRes.rows[0]) throw new Error('Escrow cannot be released while a dispute is open');

    const paymentRes = await client.query(
      `select * from payments where job_id = $1 and escrow_status = 'held' order by created_at desc limit 1 for update`,
      [jobId],
    );
    const payment = paymentRes.rows[0];
    if (!payment) return { released: false, reason: 'no_held_escrow' };

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

    return {
      released: true,
      jobValue,
      commissionAmount,
      providerAmount,
      currency,
      settlement,
      payout,
      payment,
      job,
    };
  });

  if (!released.released) return released;

  // ── Post-transaction: notifications + audit + realtime ──
  const { emitEvent } = await import('../realtime.js');

  if (released.settlement) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       select owner_user_id, 'settlement_created', 'Settlement Created', $2, $3::jsonb
       from company_profiles where id = $1`,
      [released.settlement.company_id,
       `${released.currency} ${released.settlement.net_amount.toLocaleString()} has been added to your pending settlements.`,
       JSON.stringify({ jobId, settlementId: released.settlement.id })],
    );
    const owner = await query(
      `select owner_user_id from company_profiles where id = $1`,
      [released.settlement.company_id],
    );
    if (owner.rows[0]) {
      emitEvent('payment:confirmed', { jobId, settlement: released.settlement }, `user:${owner.rows[0].owner_user_id}`);
    }
  } else if (released.job?.fundi_id) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'payment_received', 'Payment Received', $2, $3::jsonb)`,
      [released.job.fundi_id,
       `${released.currency} ${released.providerAmount.toLocaleString()} has been credited to your wallet for the completed job.`,
       JSON.stringify({ jobId, amount: released.providerAmount })],
    );
    emitEvent('payment:confirmed', { jobId, fundiEarnings: released.providerAmount }, `user:${released.job.fundi_id}`);
  }

  emitEvent('escrow:released', { jobId, amount: released.providerAmount }, `job:${jobId}`);
  await auditLog({
    userId: actorId,
    action: 'escrow.release',
    entityType: 'job',
    entityId: jobId,
    metadata: {
      source,
      actorRole,
      commission: released.commissionAmount,
      providerAmount: released.providerAmount,
      settlementId: released.settlement?.id || null,
      payoutId: released.payout?.id || null,
    },
  });

  return released;
}
