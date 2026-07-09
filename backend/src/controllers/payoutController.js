import { query, transaction } from '../db.js';
import { badRequest } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { auditLog } from '../services/auditService.js';
import { assertValidMpesaPhone } from '../services/mpesaService.js';
import { calculateWithdrawalFee, getPaymentSettings } from '../services/financeService.js';
import { calculateCommissionDebtDeduction, applyCommissionDebtDeduction } from '../services/fraudService.js';
import { recordTimelineEvent } from '../services/timelineService.js';

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Amount must be greater than zero');
  return Math.round(amount * 100) / 100;
}

async function availablePayoutBalance(client, fundiId) {
  const result = await client.query(
    `select
       coalesce((
         select sum(et.amount)
         from escrow_transactions et
         join jobs j on j.id = et.job_id
         where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
       ), 0)
       -
       coalesce((
         select sum(p.amount)
         from payouts p
         where p.fundi_id = $1 and p.status in ('requested', 'processing', 'completed')
       ), 0) as available`,
    [fundiId],
  );
  return Number(result.rows[0]?.available || 0);
}

export async function requestPayout(req, res) {
  const { amount, mpesaNumber, idempotencyKey = req.get('Idempotency-Key') } = req.body || {};
  if (!amount || !mpesaNumber) throw badRequest('Amount and M-Pesa number are required');
  const normalizedPhone = assertValidMpesaPhone(mpesaNumber);
  const requestedAmount = parsePositiveAmount(amount);
  const payout = await transaction(async (client) => {
    if (idempotencyKey) {
      const duplicate = await client.query('select * from payouts where idempotency_key = $1', [idempotencyKey]);
      if (duplicate.rows[0]) return duplicate.rows[0];
    }
    const [available, settings, fundi, disputes, fraud] = await Promise.all([
      availablePayoutBalance(client, req.user.id),
      getPaymentSettings(client),
      client.query(
        `select f.payout_frozen, f.wallet_frozen, f.trust_score, u.trust_score as user_trust_score
         from fundis f join users u on u.id = f.user_id where f.user_id = $1`,
        [req.user.id],
      ),
      client.query(
        `select d.id from disputes d join jobs j on j.id = d.job_id
         where j.fundi_id = $1 and d.status in ('open', 'under_review') limit 1`,
        [req.user.id],
      ),
      client.query(
        `select id from fraud_alerts where user_id = $1 and resolved_at is null and severity in ('high', 'critical') limit 1`,
        [req.user.id],
      ),
    ]);
    const fundiRow = fundi.rows[0];
    const trustScore = Number(fundiRow?.trust_score ?? fundiRow?.user_trust_score ?? req.user.trust_score ?? 0);
    if (!fundiRow) throw badRequest('Fundi profile is required before payout');
    if (fundiRow.payout_frozen || fundiRow.wallet_frozen) throw badRequest('Payout is frozen by admin');
    if (trustScore < Number(settings.minimumTrustScoreForPayout || 30)) throw badRequest('Payout blocked by trust score threshold');
    if (disputes.rows[0]) throw badRequest('Payout blocked while a dispute is open');
    if (fraud.rows[0]) throw badRequest('Payout blocked while fraud investigation is active');
    if (requestedAmount < Number(settings.minimumPayoutKes || 0)) throw badRequest('Requested payout is below the minimum payout amount');
    if (requestedAmount > available) throw badRequest('Requested payout exceeds available balance');
    const fee = calculateWithdrawalFee(requestedAmount, settings);
    const debtPreview = await calculateCommissionDebtDeduction(req.user.id, fee.netAmount, client);
    const result = await client.query(
      `insert into payouts (fundi_id, amount, mpesa_number, status, idempotency_key, withdrawal_fee, net_amount, protection_snapshot)
       values ($1, $2, $3, 'requested', $4, $5, $6, $7::jsonb) returning *`,
      [
        req.user.id,
        requestedAmount,
        normalizedPhone,
        idempotencyKey || null,
        fee.withdrawalFee,
        debtPreview.netPayout,
        JSON.stringify({
          trustScore,
          available,
          withdrawalFeeType: fee.withdrawalFeeType,
          commissionDebtDeducted: debtPreview.deducted,
        }),
      ],
    );
    if (debtPreview.deducted > 0) {
      await applyCommissionDebtDeduction({
        userId: req.user.id,
        payoutAmount: fee.netAmount,
        payoutId: result.rows[0].id,
        client,
      });
    }
    if (fee.withdrawalFee > 0) {
      await client.query(
        `insert into revenue_ledger (payout_id, user_id, entry_type, amount, metadata)
         values ($1, $2, 'withdrawal_fee', $3, $4::jsonb)`,
        [result.rows[0].id, req.user.id, fee.withdrawalFee, JSON.stringify({ withdrawalFeeType: fee.withdrawalFeeType })],
      );
      await client.query(
        `insert into accounting_ledger (source_type, source_id, debit_account, credit_account, amount, metadata)
         values ('payout', $1, 'fundi_wallet', 'platform_revenue', $2, $3::jsonb)`,
        [result.rows[0].id, fee.withdrawalFee, JSON.stringify({ type: 'withdrawal_fee' })],
      );
    }
    return result.rows[0];
  });
  await recordTimelineEvent({
    jobId: payout.job_id,
    eventType: 'payout_requested',
    actorId: req.user.id,
    actorRole: 'fundi',
    metadata: { payoutId: payout.id, amount: payout.amount },
  });
  await auditLog({ userId: req.user.id, action: 'payout.request', entityType: 'payout', entityId: payout.id });
  emitEvent('payout:requested', { payoutId: payout.id, fundiId: req.user.id });
  res.status(201).json({ success: true, payout });
}

export async function releaseEscrow(req, res) {
  const result = await transaction(async (client) => {
    const job = await client.query('select * from jobs where id = $1 for update', [req.params.jobId]);
    const row = job.rows[0];
    if (!row) throw badRequest('Job not found');
    if (!row.fundi_id) throw badRequest('Job has no assigned fundi');
    if (row.status !== 'completed' || !row.customer_completion_confirmed) {
      throw badRequest('Escrow can only be released after customer-confirmed completion');
    }
    const dispute = await client.query(
      `select id from disputes where job_id = $1 and status in ('open', 'under_review') limit 1`,
      [req.params.jobId],
    );
    if (dispute.rows[0]) throw badRequest('Escrow cannot be released while a dispute is open');
    const payment = await client.query(
      `select * from payments where job_id = $1 and escrow_status = 'held' order by created_at desc limit 1 for update`,
      [req.params.jobId],
    );
    if (!payment.rows[0]) throw badRequest('No held escrow found');
    await client.query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       select $1, $2, 'release', $3, 'released'
       where not exists (
         select 1 from escrow_transactions where payment_id = $2 and type = 'release'
       )`,
      [req.params.jobId, payment.rows[0].id, payment.rows[0].fundi_amount || payment.rows[0].amount],
    );
    await client.query(`update payments set escrow_status = 'released', updated_at = now() where id = $1`, [payment.rows[0].id]);
    await client.query(
      `update escrow_accounts set balance = 0, status = 'payout_processing', updated_at = now() where job_id = $1`,
      [req.params.jobId],
    );
    await client.query(`update jobs set escrow_status = 'released', payment_status = 'payout_processing' where id = $1`, [req.params.jobId]);
    return client.query(
      `insert into payouts (job_id, fundi_id, amount, status, net_amount, protection_snapshot)
       select $1, $2, $3, 'processing', $4, $5::jsonb
       where not exists (
         select 1 from payouts where job_id = $1 and status in ('requested', 'processing', 'completed')
       )
       returning *`,
      [
        req.params.jobId,
        row.fundi_id,
        payment.rows[0].fundi_amount || payment.rows[0].amount,
        payment.rows[0].fundi_amount || payment.rows[0].amount,
        JSON.stringify({ source: 'escrow_release', platformCommission: payment.rows[0].platform_commission || 0 }),
      ],
    );
  });
  await recordTimelineEvent({
    jobId: req.params.jobId,
    eventType: 'escrow_released',
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  await auditLog({ userId: req.user.id, action: 'escrow.release', entityType: 'job', entityId: req.params.jobId });
  emitEvent('escrow:released', { jobId: req.params.jobId, payout: result.rows[0] || null }, `job:${req.params.jobId}`);
  emitEvent('payout:processing', { jobId: req.params.jobId, payout: result.rows[0] || null }, `job:${req.params.jobId}`);
  res.json({ success: true, payout: result.rows[0] });
}

export async function freezeEscrow(req, res) {
  await query(
    `update payments set escrow_status = 'frozen', updated_at = now() where job_id = $1 and escrow_status = 'held'`,
    [req.params.jobId],
  );
  await query(`update jobs set escrow_status = 'frozen' where id = $1`, [req.params.jobId]);
  await query(`update escrow_accounts set status = 'frozen', updated_at = now() where job_id = $1`, [req.params.jobId]);
  await auditLog({ userId: req.user.id, action: 'escrow.freeze', entityType: 'job', entityId: req.params.jobId });
  res.json({ success: true });
}

export async function completePayout(req, res) {
  const { providerReference = null } = req.body || {};
  const result = await transaction(async (client) => {
    const payout = await client.query('select * from payouts where id = $1 for update', [req.params.id]);
    if (!payout.rows[0]) throw badRequest('Payout not found');
    if (payout.rows[0].status === 'completed') return payout.rows[0];
    const updated = await client.query(
      `update payouts set status = 'completed', provider_reference = coalesce($2, provider_reference), updated_at = now()
       where id = $1 returning *`,
      [req.params.id, providerReference],
    );
    if (updated.rows[0].job_id) {
      await client.query(`update jobs set payment_status = 'payout_completed', updated_at = now() where id = $1`, [updated.rows[0].job_id]);
      await client.query(`update escrow_accounts set status = 'payout_completed', updated_at = now() where job_id = $1`, [updated.rows[0].job_id]);
    }
    return updated.rows[0];
  });
  await recordTimelineEvent({
    jobId: result.job_id,
    eventType: 'payout_completed',
    actorId: req.user.id,
    actorRole: 'admin',
    metadata: { payoutId: req.params.id },
  });
  await auditLog({ userId: req.user.id, action: 'payout.complete', entityType: 'payout', entityId: req.params.id });
  emitEvent('payout:completed', { payoutId: req.params.id, payout: result }, result.fundi_id ? `user:${result.fundi_id}` : null);
  res.json({ success: true, payout: result });
}

// ── Process Refund (admin only) ───────────────────────────────
// Refunds a customer's payment for a cancelled or disputed job.
// The escrow is reversed: fundi wallet debited (if already credited),
// customer refunded via M-Pesa reversal, platform commission reversed.
export async function processRefund(req, res) {
  const { jobId, reason, amount: customAmount } = req.body || {};
  if (!jobId) throw badRequest('Job ID is required');
  if (!reason) throw badRequest('Refund reason is required');

  const result = await transaction(async (client) => {
    // Lock the payment row
    const payment = await client.query(
      `select * from payments where job_id = $1 and status = 'completed' order by created_at desc limit 1 for update`,
      [jobId],
    );
    if (!payment.rows[0]) throw badRequest('No completed payment found for this job');

    const refundAmount = customAmount ? Number(customAmount) : Number(payment.rows[0].amount);

    // Check if fundi was already paid — if so, debit their wallet
    const walletTx = await client.query(
      `select * from wallet_transactions where job_id = $1 and type = 'credit' and status = 'completed'`,
      [jobId],
    );
    if (walletTx.rows[0]) {
      const fundiId = walletTx.rows[0].fundi_id;
      const creditedAmount = Number(walletTx.rows[0].amount);
      await client.query(
        `update fundi_wallets set balance = greatest(0, balance - $2), updated_at = now() where fundi_id = $1`,
        [fundiId, creditedAmount],
      );
      await client.query(
        `insert into wallet_transactions (fundi_id, job_id, type, amount, description, status)
         values ($1, $2, 'debit', $3, 'Refund - job cancelled/disputed', 'completed')`,
        [fundiId, jobId, creditedAmount],
      );
    }

    // Mark payment as refunded
    await client.query(
      `update payments set status = 'refunded', escrow_status = 'refunded', updated_at = now() where id = $1`,
      [payment.rows[0].id],
    );

    // Record revenue ledger entry
    await client.query(
      `insert into revenue_ledger (job_id, transaction_type, amount, currency, user_id, notes)
       values ($1, 'refund', $2, 'KES', $3, $4)`,
      [jobId, refundAmount, payment.rows[0].customer_id, `Refund: ${reason}`],
    );

    // Update job
    await client.query(
      `update jobs set payment_status = 'refunded', escrow_status = 'refunded', updated_at = now() where id = $1`,
      [jobId],
    );

    return { refundAmount, paymentId: payment.rows[0].id };
  });

  // Notify customer
  const job = await query('select customer_id from jobs where id = $1', [jobId]);
  if (job.rows[0]) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'refund_processed', 'Refund Processed', $2, $3::jsonb)`,
      [job.rows[0].customer_id,
       `KES ${result.refundAmount.toLocaleString()} has been refunded to your M-Pesa.`,
       JSON.stringify({ jobId, amount: result.refundAmount })],
    );
  }

  await auditLog({
    userId: req.user.id,
    action: 'refund.processed',
    entityType: 'payment',
    entityId: result.paymentId,
    metadata: { jobId, amount: result.refundAmount, reason },
  });

  res.json({ success: true, refund: { jobId, amount: result.refundAmount, reason } });
}
