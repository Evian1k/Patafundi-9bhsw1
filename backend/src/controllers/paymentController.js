import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import {
  assertValidMpesaPhone,
  initiateStkPush,
  verifyCallbackSecret,
  verifyWebhookSignature,
} from '../services/mpesaService.js';
import { auditLog } from '../services/auditService.js';
import { emitEvent } from '../realtime.js';

function canAccessJob(user, job) {
  return user.role === 'admin' || job.customer_id === user.id || job.fundi_id === user.id;
}

function parsePositiveAmount(value, label = 'Amount') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest(`${label} must be greater than zero`);
  return Math.round(amount * 100) / 100;
}

export async function stkPush(req, res) {
  const { jobId, mpesaNumber, amount, idempotencyKey = req.get('Idempotency-Key') } = req.body || {};
  if (!jobId || !mpesaNumber) throw badRequest('Job and M-Pesa number are required');
  const normalizedPhone = assertValidMpesaPhone(mpesaNumber);
  const key = idempotencyKey || crypto.randomUUID();
  const payment = await transaction(async (client) => {
    const duplicate = await client.query('select * from payments where idempotency_key = $1', [key]);
    if (duplicate.rows[0]) return duplicate.rows[0];
    const jobResult = await client.query('select * from jobs where id = $1 for update', [jobId]);
    const job = jobResult.rows[0];
    if (!job) throw notFound('Job not found');
    if (job.customer_id !== req.user.id && req.user.role !== 'admin') throw forbidden('Only the job customer can pay for this job');
    if (['cancelled', 'failed'].includes(job.status)) throw badRequest('Cannot pay for a cancelled or failed job');
    if (['escrow_held', 'payout_processing', 'payout_completed'].includes(job.payment_status)) {
      throw badRequest('This job has already been paid');
    }
    const payableAmount = parsePositiveAmount(amount || job.final_price || job.estimated_price);
    const inserted = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, provider, mpesa_number,
        status, escrow_status, idempotency_key)
       values ($1, $2, $3, 'KES', 'mpesa', $4, 'pending', 'pending', $5) returning *`,
      [jobId, req.user.id, payableAmount, normalizedPhone, key],
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
  const signature = req.get('x-mpesa-signature');
  if (!verifyCallbackSecret(req) && !verifyWebhookSignature(req.rawBody, signature)) {
    throw forbidden('Invalid M-Pesa callback signature');
  }
  const callback = req.body?.Body?.stkCallback || req.body?.stkCallback || req.body;
  const checkoutRequestId = callback.CheckoutRequestID || callback.checkoutRequestId;
  const resultCode = Number(callback.ResultCode ?? callback.resultCode);
  if (!checkoutRequestId) throw badRequest('CheckoutRequestID missing');

  const payment = await transaction(async (client) => {
    const paymentResult = await client.query('select * from payments where checkout_request_id = $1 for update', [checkoutRequestId]);
    const row = paymentResult.rows[0];
    if (!row) throw notFound('Payment not found');
    if (row.status === 'completed') return row;
    if (row.status !== 'pending') return row;
    if (resultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];
      const receipt = metadata.find((item) => item.Name === 'MpesaReceiptNumber')?.Value || callback.MpesaReceiptNumber;
      if (!receipt) throw badRequest('MpesaReceiptNumber missing');
      const updated = await client.query(
        `update payments set status = 'completed', escrow_status = 'held', mpesa_receipt_number = $2,
          provider_response = $3, paid_at = now(), updated_at = now()
         where id = $1 and status = 'pending' returning *`,
        [row.id, receipt, JSON.stringify(req.body)],
      );
      if (!updated.rows[0]) return row;
      await client.query(
        `insert into escrow_transactions (job_id, payment_id, type, amount, status)
         select $1, $2, 'hold', $3, 'held'
         where not exists (
           select 1 from escrow_transactions where payment_id = $2 and type = 'hold'
         )`,
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
  const result = await query(
    `select p.* from payments p
     join jobs j on j.id = p.job_id
     where p.job_id = $1 and ($2 = 'admin' or j.customer_id = $3 or j.fundi_id = $3)
     order by p.created_at desc limit 1`,
    [req.params.jobId, req.user.role, req.user.id],
  );
  if (!result.rows[0]) {
    const job = await query('select id from jobs where id = $1', [req.params.jobId]);
    if (!job.rows[0]) throw notFound('Job not found');
  }
  res.json({ success: true, payment: result.rows[0] || null });
}

export async function escrowForJob(req, res) {
  const job = await query('select customer_id, fundi_id from jobs where id = $1', [req.params.jobId]);
  if (!job.rows[0]) throw notFound('Job not found');
  if (!canAccessJob(req.user, job.rows[0])) throw forbidden('Not allowed to access this escrow');
  const result = await query('select * from escrow_transactions where job_id = $1 order by created_at desc', [req.params.jobId]);
  res.json({ success: true, escrow: result.rows });
}

export async function walletBalance(req, res) {
  const result = await query(
    `select
       coalesce((
         select sum(et.amount)
         from escrow_transactions et
         join jobs j on j.id = et.job_id
         where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
       ), 0) as total_earnings,
       coalesce((
         select sum(p.amount)
         from payouts p
         where p.fundi_id = $1 and p.status in ('requested', 'processing', 'completed')
       ), 0) as paid_or_pending`,
    [req.user.id],
  );
  const totalEarnings = Number(result.rows[0]?.total_earnings || 0);
  const paidOrPending = Number(result.rows[0]?.paid_or_pending || 0);
  res.json({
    success: true,
    balance: Math.max(0, totalEarnings - paidOrPending),
    escrowPending: 0,
    totalEarnings,
  });
}
