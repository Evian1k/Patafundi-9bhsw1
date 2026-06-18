import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound, parseUuid } from '../utils/http.js';
import {
  assertValidMpesaPhone,
  initiateStkPush,
  verifyCallbackSecret,
  verifyWebhookSignature,
} from '../services/mpesaService.js';
import { auditLog } from '../services/auditService.js';
import { calculateCommission, getPaymentSettings } from '../services/financeService.js';
import { emitEvent } from '../realtime.js';
import { recordTimelineEvent } from '../services/timelineService.js';
import {
  markCommissionPaymentReceived,
  isWebhookReplay,
  recordWebhookProcessed,
} from '../services/fraudService.js';

function canAccessJob(user, job) {
  return user.role === 'admin' || job.customer_id === user.id || job.fundi_id === user.id;
}

function parsePositiveAmount(value, label = 'Amount') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest(`${label} must be greater than zero`);
  return Math.round(amount * 100) / 100;
}

function callbackMetadataValue(callback, name) {
  const metadata = callback.CallbackMetadata?.Item || [];
  return metadata.find((item) => item.Name === name)?.Value;
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
    const expectedAmount = parsePositiveAmount(job.final_price || job.estimated_price || amount);
    const requestedAmount = parsePositiveAmount(amount || expectedAmount);
    if (Math.abs(requestedAmount - expectedAmount) > 0.01) {
      throw badRequest('Payment amount does not match the job amount');
    }
    const settings = await getPaymentSettings(client);
    const commission = calculateCommission({
      amount: expectedAmount,
      category: job.service_category,
      settings,
    });
    const inserted = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, provider, mpesa_number,
        status, escrow_status, idempotency_key, commission_rate, commission_type,
        platform_commission, fundi_amount, commission_details)
       values ($1, $2, $3, 'KES', 'mpesa', $4, 'pending', 'pending', $5, $6, $7, $8, $9, $10::jsonb) returning *`,
      [
        jobId,
        req.user.id,
        expectedAmount,
        normalizedPhone,
        key,
        commission.commissionRate,
        commission.commissionType,
        commission.platformCommission,
        commission.fundiAmount,
        JSON.stringify(commission.details),
      ],
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
  const receiptPreview = callback.CallbackMetadata?.Item?.find((i) => i.Name === 'MpesaReceiptNumber')?.Value
    || callback.MpesaReceiptNumber || null;

  const payment = await transaction(async (client) => {
    if (await isWebhookReplay({ checkoutRequestId, receipt: receiptPreview, rawBody: req.rawBody, client })) {
      const existing = await client.query('select * from payments where checkout_request_id = $1', [checkoutRequestId]);
      return existing.rows[0] || { status: 'completed' };
    }
    const paymentResult = await client.query('select * from payments where checkout_request_id = $1 for update', [checkoutRequestId]);
    const row = paymentResult.rows[0];
    if (!row) throw notFound('Payment not found');
    if (row.status === 'completed') return row;
    if (row.status !== 'pending') return row;
    if (resultCode === 0) {
      const receipt = callbackMetadataValue(callback, 'MpesaReceiptNumber') || callback.MpesaReceiptNumber;
      const paidAmount = Number(callbackMetadataValue(callback, 'Amount') ?? callback.Amount ?? row.amount);
      if (!receipt) throw badRequest('MpesaReceiptNumber missing');
      if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(row.amount)) > 0.01) {
        throw badRequest('Callback amount does not match pending payment');
      }
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
      await client.query(
        `insert into revenue_ledger (payment_id, job_id, user_id, entry_type, amount, currency, metadata)
         values ($1, $2, $3, 'commission', $4, $5, $6::jsonb)`,
        [
          row.id,
          row.job_id,
          row.customer_id,
          row.platform_commission || 0,
          row.currency || 'KES',
          JSON.stringify({ source: 'payment_webhook', commissionRate: row.commission_rate, commissionType: row.commission_type }),
        ],
      );
      await client.query(
        `insert into accounting_ledger (source_type, source_id, debit_account, credit_account, amount, currency, metadata)
         values
          ('payment', $1, 'customer_cash', 'escrow_liability', $2, $4, $5::jsonb),
          ('payment', $1, 'escrow_liability', 'platform_revenue', $3, $4, $5::jsonb)`,
        [
          row.id,
          row.amount,
          row.platform_commission || 0,
          row.currency || 'KES',
          JSON.stringify({ jobId: row.job_id, fundiAmount: row.fundi_amount || 0 }),
        ],
      );
      await client.query(`update jobs set payment_status = 'escrow_held', escrow_status = 'held' where id = $1`, [row.job_id]);
      await markCommissionPaymentReceived(row.job_id, client);
      await recordWebhookProcessed({
        checkoutRequestId,
        receipt,
        paymentId: row.id,
        rawBody: req.rawBody,
        client,
      });
      await client.query(
        `insert into job_timeline (job_id, event_type, metadata)
         values ($1, 'payment_made', $2::jsonb)`,
        [row.job_id, JSON.stringify({ paymentId: row.id, amount: row.amount, receipt })],
      );
      return updated.rows[0];
    }
    const failed = await client.query(
      `update payments set status = 'failed', failure_reason = $2, provider_response = $3, updated_at = now()
       where id = $1 returning *`,
      [row.id, callback.ResultDesc || 'M-Pesa payment failed', JSON.stringify(req.body)],
    );
    return failed.rows[0];
  });

  if (payment.status === 'completed') {
    emitEvent('payment:confirmed', { jobId: payment.job_id, payment }, `job:${payment.job_id}`);
    emitEvent('escrow:held', { jobId: payment.job_id, paymentId: payment.id, amount: payment.amount }, `job:${payment.job_id}`);
  } else {
    emitEvent('payment:failed', { jobId: payment.job_id, payment }, `job:${payment.job_id}`);
  }
  res.json({ success: true });
}

export async function paymentForJob(req, res) {
  const jobId = parseUuid(req.params.jobId, 'job id');
  const result = await query(
    `select p.* from payments p
     join jobs j on j.id = p.job_id
     where p.job_id = $1 and ($2 = 'admin' or j.customer_id = $3 or j.fundi_id = $3)
     order by p.created_at desc limit 1`,
    [jobId, req.user.role, req.user.id],
  );
  if (!result.rows[0]) {
    const job = await query('select id from jobs where id = $1', [jobId]);
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
