/**
 * Refund Request workflow (spec §8 + §23).
 *
 * Money-honesty contract:
 *   - Customers can REQUEST a refund for a paid job. A request is a record,
 *     never a promise — it must be reviewed by an administrator.
 *   - Approving a request executes the EXISTING atomic ledger reversal
 *     (processRefund: wallet debit / settlement void / revenue_ledger refund
 *     entry / audit). No fake payout or refund rows are ever created.
 *   - The final provider-side money movement (e.g. M-Pesa reversal API call)
 *     is executed through the configured payment provider workflow and is
 *     documented as an operational step until the reversal integration is
 *     enabled — the platform never silently pretends money moved.
 */
import { query, transaction } from '../db.js';
import { badRequest, notFound, forbidden } from '../utils/http.js';
import { notify } from '../services/notificationService.js';
import { auditLog } from '../services/auditService.js';

const OPEN_STATUSES = ['requested', 'approved', 'processing'];

export async function createRefundRequest(req, res) {
  const jobId = req.params.id || req.body?.jobId;
  const reason = String(req.body?.reason || '').trim();
  const details = String(req.body?.details || '').trim() || null;
  if (!jobId) throw badRequest('Job ID is required');
  if (!reason) throw badRequest('A refund reason is required');

  const jobRes = await query('select * from jobs where id = $1', [jobId]);
  const job = jobRes.rows[0];
  if (!job) throw notFound('Job not found');
  if (job.customer_id !== req.user.id && !req.user.isAdmin) {
    throw forbidden('Only the customer who paid for this job can request a refund');
  }

  // The job must have a completed payment — refunds apply to real money in.
  const paymentRes = await query(
    `select id, amount, status, currency from payments where job_id = $1 and status = 'completed' order by created_at desc limit 1`,
    [jobId],
  );
  const payment = paymentRes.rows[0];
  if (!payment) throw badRequest('No completed payment found for this job — nothing to refund');

  // One open request per job; a completed refund blocks new requests.
  const existing = await query(
    `select id, status from refund_requests where job_id = $1 order by created_at desc limit 1`,
    [jobId],
  );
  if (existing.rows[0] && OPEN_STATUSES.includes(existing.rows[0].status)) {
    throw badRequest('A refund request for this job is already being reviewed');
  }
  if (existing.rows[0]?.status === 'completed') {
    throw badRequest('This job was already refunded');
  }

  // Requested amount defaults to the full paid amount; admin can adjust on
  // decision (partial refunds go through the dispute path or custom amount).
  const amount = req.body?.amount != null ? Number(req.body.amount) : Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Refund amount must be greater than zero');
  if (amount > Number(payment.amount) + 0.001) throw badRequest('Refund amount cannot exceed the amount paid');

  const result = await query(
    `insert into refund_requests (job_id, payment_id, customer_id, amount, reason, details, status)
     values ($1, $2, $3, $4, $5, $6, 'requested') returning *`,
    [jobId, payment.id, req.user.id, amount, reason.slice(0, 200), details?.slice(0, 2000)],
  );

  await notify({
    userId: req.user.id,
    type: 'refund_requested',
    title: 'Refund request received',
    body: 'Your refund request is in review. Our team will decide it shortly and you will be notified of the outcome.',
    data: { jobId, refundRequestId: result.rows[0].id },
  });

  res.status(201).json({ success: true, refundRequest: result.rows[0] });
}

export async function listMyRefundRequests(req, res) {
  const result = await query(
    `select rr.*, j.service_category, j.status as job_status
     from refund_requests rr join jobs j on j.id = rr.job_id
     where rr.customer_id = $1 order by rr.created_at desc`,
    [req.user.id],
  );
  res.json({ success: true, refundRequests: result.rows });
}

export async function listRefundRequests(req, res) {
  const status = req.query?.status || null;
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = `where rr.status = $${params.length}`;
  }
  const result = await query(
    `select rr.*, j.service_category, j.status as job_status,
            u.full_name as customer_name, u.email as customer_email
     from refund_requests rr
     join jobs j on j.id = rr.job_id
     join users u on u.id = rr.customer_id
     ${where} order by rr.created_at desc limit 200`,
    params,
  );
  res.json({ success: true, refundRequests: result.rows });
}

export async function decideRefundRequest(req, res) {
  const { action, notes } = req.body || {};
  const amountOverride = req.body?.amount != null ? Number(req.body.amount) : null;
  if (!['approve', 'reject'].includes(action)) throw badRequest('action must be approve or reject');

  const decision = await transaction(async (client) => {
    const rr = await client.query(
      `select * from refund_requests where id = $1 for update`,
      [req.params.id],
    );
    const request = rr.rows[0];
    if (!request) throw notFound('Refund request not found');
    if (!OPEN_STATUSES.includes(request.status)) {
      throw badRequest(`This refund request was already ${request.status}`);
    }

    if (action === 'reject') {
      const updated = await client.query(
        `update refund_requests set status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_notes = $3, updated_at = now()
         where id = $1 returning *`,
        [request.id, req.user.id, String(notes || '').slice(0, 1000) || null],
      );
      return { request: updated.rows[0], refundResult: null };
    }

    // Approve: re-validate the payment is still completed, then run the
    // existing atomic reversal path. The override amount must stay within bounds.
    const payment = await client.query(
      `select * from payments where id = $1 for update`,
      [request.payment_id],
    );
    if (!payment.rows[0] || payment.rows[0].status !== 'completed') {
      throw badRequest('The underlying payment is no longer refundable');
    }
    const finalAmount = amountOverride ?? Number(request.amount);
    if (finalAmount <= 0 || finalAmount > Number(payment.rows[0].amount) + 0.001) {
      throw badRequest('Refund amount is invalid');
    }

    await client.query(
      `update refund_requests set status = 'approved', reviewed_by = $2, reviewed_at = now(), review_notes = $3, amount = $4, updated_at = now()
       where id = $1 returning *`,
      [request.id, req.user.id, String(notes || '').slice(0, 1000) || null, finalAmount],
    );

    // Execute the real reversal using the battle-tested processRefund service
    // logic (wallet debit + settlement void + revenue ledger + audit).
    const { executeRefundReversal } = await import('../services/refundReversalService.js');
    const refundResult = await executeRefundReversal({
      jobId: request.job_id,
      reason: `Refund request ${request.id}: ${request.reason}`,
      amount: finalAmount,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    const completed = await client.query(
      `update refund_requests set status = 'completed', updated_at = now() where id = $1 returning *`,
      [request.id],
    );
    return { request: completed.rows[0], refundResult };
  });

  const approved = action === 'approve';
  await notify({
    userId: decision.request.customer_id,
    type: approved ? 'refund_approved' : 'refund_rejected',
    title: approved ? 'Refund approved' : 'Refund request declined',
    body: approved
      ? `Your refund of KES ${Number(decision.request.amount).toLocaleString()} for this job has been approved and is being processed back to your original payment method.`
      : `Your refund request was declined. ${notes ? `Reason: ${notes}` : 'Open a dispute if you disagree with this outcome.'}`,
    data: { jobId: decision.request.job_id, refundRequestId: decision.request.id },
  });

  // Auditability (spec §56): both refund decisions are significant actions
  // (approvals are additionally audited inside the atomic reversal path).
  await auditLog({
    userId: req.user.id,
    action: approved ? 'refund.approved' : 'refund.rejected',
    entityType: 'refund_request',
    entityId: decision.request.id,
    metadata: { jobId: decision.request.job_id, amount: Number(decision.request.amount || 0), notes: String(notes || '').slice(0, 300) || null },
  });

  res.json({ success: true, refundRequest: decision.request, refund: decision.refundResult });
}
