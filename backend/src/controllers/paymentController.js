import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { initiateStkPush, normalizePhone } from '../services/mpesaService.js';
import { auditLog } from '../services/auditService.js';
import { emitEvent } from '../realtime.js';

export async function stkPush(req, res) {
  const { jobId, mpesaNumber, amount, idempotencyKey = req.get('Idempotency-Key') } = req.body || {};
  if (!jobId || !mpesaNumber) throw badRequest('Job and M-Pesa number are required');
  const key = idempotencyKey || crypto.randomUUID();
  const payment = await transaction(async (client) => {
    const duplicate = await client.query('select * from payments where idempotency_key = $1', [key]);
    if (duplicate.rows[0]) return duplicate.rows[0];
    const jobResult = await client.query('select * from jobs where id = $1 for update', [jobId]);
    const job = jobResult.rows[0];
    if (!job) throw notFound('Job not found');
    const payableAmount = Number(amount || job.final_price || job.estimated_price);
    if (!payableAmount || payableAmount <= 0) throw badRequest('Payment amount is required');
    const inserted = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, provider, mpesa_number,
        status, escrow_status, idempotency_key)
       values ($1, $2, $3, 'KES', 'mpesa', $4, 'pending', 'pending', $5) returning *`,
      [jobId, req.user.id, payableAmount, normalizePhone(mpesaNumber), key],
    );
    return inserted.rows[0];
  });

  const daraja = await initiateStkPush({
    phone: mpesaNumber,
    amount: payment.amount,
    accountReference: `JOB-${jobId}`,
    transactionDesc: `PataFundi escrow payment for job ${jobId}`,
  });

  await query(
    `update payments set checkout_request_id = $2, merchant_request_id = $3, provider_response = $4, updated_at = now()
     where id = $1`,
    [payment.id, daraja.CheckoutRequestID, daraja.MerchantRequestID, JSON.stringify(daraja)],
  );
  await auditLog({ userId: req.user.id, action: 'payment.stk_push', entityType: 'payment', entityId: payment.id, metadata: { jobId } });
  emitEvent('payment:initiated', { jobId, paymentId: payment.id, checkoutRequestId: daraja.CheckoutRequestID }, `job:${jobId}`);
  res.status(202).json({ success: true, paymentId: payment.id, checkoutRequestId: daraja.CheckoutRequestID });
}

export async function legacyProcess(req, res) {
  req.body = { ...req.body, jobId: req.params.jobId };
  return stkPush(req, res);
}

export async function webhook(req, res) {
  const callback = req.body?.Body?.stkCallback || req.body?.stkCallback || req.body;
  const checkoutRequestId = callback.CheckoutRequestID || callback.checkoutRequestId;
  const resultCode = Number(callback.ResultCode ?? callback.resultCode);
  if (!checkoutRequestId) throw badRequest('CheckoutRequestID missing');

  const payment = await transaction(async (client) => {
    const paymentResult = await client.query('select * from payments where checkout_request_id = $1 for update', [checkoutRequestId]);
    const row = paymentResult.rows[0];
    if (!row) throw notFound('Payment not found');
    if (row.status === 'completed') return row;
    if (resultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];
      const receipt = metadata.find((item) => item.Name === 'MpesaReceiptNumber')?.Value || callback.MpesaReceiptNumber;
      const updated = await client.query(
        `update payments set status = 'completed', escrow_status = 'held', mpesa_receipt_number = $2,
          provider_response = $3, paid_at = now(), updated_at = now()
         where id = $1 returning *`,
        [row.id, receipt, JSON.stringify(req.body)],
      );
      await client.query(
        `insert into escrow_transactions (job_id, payment_id, type, amount, status)
         values ($1, $2, 'hold', $3, 'held')`,
        [row.job_id, row.id, row.amount],
      );
      await client.query(
        `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
         select j.id, j.customer_id, j.fundi_id, $2, 'escrow_held' from jobs j where j.id = $1
         on conflict (job_id) do update set balance = excluded.balance, status = 'escrow_held', updated_at = now()`,
        [row.job_id, row.amount],
      );
      await client.query(`update jobs set payment_status = 'escrow_held', escrow_status = 'held' where id = $1`, [row.job_id]);
      return updated.rows[0];
    }
    const failed = await client.query(
      `update payments set status = 'failed', failure_reason = $2, provider_response = $3, updated_at = now()
       where id = $1 returning *`,
      [row.id, callback.ResultDesc || 'M-Pesa payment failed', JSON.stringify(req.body)],
    );
    return failed.rows[0];
  });

  emitEvent(payment.status === 'completed' ? 'payment:confirmed' : 'payment:failed', { jobId: payment.job_id, payment }, `job:${payment.job_id}`);
  res.json({ success: true });
}

export async function paymentForJob(req, res) {
  const result = await query('select * from payments where job_id = $1 order by created_at desc limit 1', [req.params.jobId]);
  res.json({ success: true, payment: result.rows[0] || null });
}

export async function escrowForJob(req, res) {
  const result = await query('select * from escrow_transactions where job_id = $1 order by created_at desc', [req.params.jobId]);
  res.json({ success: true, escrow: result.rows });
}

export async function walletBalance(req, res) {
  const result = await query(
    `select coalesce(sum(case when status = 'completed' then amount else 0 end),0) as balance
     from payouts where fundi_id = $1`,
    [req.user.id],
  );
  res.json({ success: true, balance: Number(result.rows[0]?.balance || 0), escrowPending: 0, totalEarnings: Number(result.rows[0]?.balance || 0) });
}
