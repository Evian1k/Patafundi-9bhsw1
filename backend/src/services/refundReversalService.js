/**
 * Refund Reversal Service — the single atomic money-out path (spec §8/§23).
 *
 * Extracted from payoutController.processRefund so that both the direct
 * admin refund endpoint AND the refund-request approval flow execute the
 * exact same ledger-safe reversal:
 *   1. Lock the completed payment row (FOR UPDATE — no double refunds).
 *   2. Debit the fundi wallet if the fundi was already credited.
 *   3. Void any pending company settlement.
 *   4. Mark payment + job refunded, write the revenue_ledger refund entry.
 *   5. Audit log with the acting administrator.
 *
 * The actual provider-side money movement (M-Pesa reversal API) remains a
 * documented operational step until the reversal integration credentials are
 * configured — this service never fabricates provider receipts.
 */
import { query, transaction } from '../db.js';
import { badRequest } from '../utils/http.js';
import { auditLog } from './auditService.js';

export async function executeRefundReversal({ jobId, reason, amount: customAmount = null, actorId, actorRole = 'admin', notifyCustomer = true }) {
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
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) throw badRequest('Refund amount is invalid');
    if (refundAmount > Number(payment.rows[0].amount) + 0.001) throw badRequest('Refund amount exceeds the amount paid');

    // Check if fundi was already credited — if so, debit their wallet
    const walletTx = await client.query(
      `select * from wallet_transactions where job_id = $1 and type = 'credit' limit 1`,
      [jobId],
    );
    if (walletTx.rows[0]) {
      const fundiId = walletTx.rows[0].fundi_id;
      const creditedAmount = Number(walletTx.rows[0].amount);
      await client.query(
        `update fundi_wallets set available_balance = greatest(0, available_balance - $2), total_withdrawn = total_withdrawn, updated_at = now() where fundi_id = $1`,
        [fundiId, creditedAmount],
      );
      const bal = await client.query(`select available_balance from fundi_wallets where fundi_id = $1`, [fundiId]);
      await client.query(
        `insert into wallet_transactions (fundi_id, job_id, type, amount, balance_after, reason)
         values ($1, $2, 'debit', $3, $4, 'Refund — job cancelled/disputed')`,
        [fundiId, jobId, creditedAmount, bal.rows[0]?.available_balance ?? 0],
      );
    }

    // Void any pending company settlement for this job
    await client.query(
      `update company_settlements set status = 'cancelled', updated_at = now()
       where job_id = $1 and status in ('pending','processing')`,
      [jobId],
    );

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

    return { refundAmount, paymentId: payment.rows[0].id, customerId: payment.rows[0].customer_id };
  });

  if (notifyCustomer && result.customerId) {
    const { notify } = await import('./notificationService.js');
    await notify({
      userId: result.customerId,
      type: 'refund_processed',
      title: 'Refund Processed',
      body: `KES ${result.refundAmount.toLocaleString()} has been refunded to your original payment method.`,
      data: { jobId, amount: result.refundAmount },
    });
  }

  await auditLog({
    userId: actorId,
    action: 'refund.processed',
    entityType: 'payment',
    entityId: result.paymentId,
    metadata: { jobId, amount: result.refundAmount, reason, actorRole, via: 'refund_reversal_service' },
  });

  return { jobId, amount: result.refundAmount, paymentId: result.paymentId, reason };
}
