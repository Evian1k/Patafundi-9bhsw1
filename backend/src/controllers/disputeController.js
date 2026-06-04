import { query, transaction } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { emitEvent } from '../realtime.js';

export async function createDispute(req, res) {
  const { jobId, reason, evidenceUrls = [] } = req.body || {};
  if (!jobId || !reason) throw badRequest('Job and reason are required');
  const dispute = await transaction(async (client) => {
    const result = await client.query(
      `insert into disputes (job_id, opened_by, reason, evidence_urls, status)
       values ($1, $2, $3, $4, 'open') returning *`,
      [jobId, req.user.id, reason, evidenceUrls],
    );
    await client.query(`update jobs set escrow_status = 'frozen' where id = $1`, [jobId]);
    await client.query(`update payments set escrow_status = 'frozen' where job_id = $1 and escrow_status = 'held'`, [jobId]);
    return result.rows[0];
  });
  emitEvent('dispute:opened', { jobId, disputeId: dispute.id }, `job:${jobId}`);
  res.status(201).json({ success: true, dispute });
}

export async function listDisputes(req, res) {
  const status = req.query.status;
  const result = await query(
    `select d.* from disputes d join jobs j on j.id = d.job_id
     where ($2::text is null or d.status = $2)
       and ($3::text = 'admin' or j.customer_id = $1 or j.fundi_id = $1)
     order by d.created_at desc`,
    [req.user.id, status || null, req.user.role],
  );
  res.json({ success: true, disputes: result.rows });
}

export async function uploadEvidence(req, res) {
  const urls = (req.files || []).map((file) => `/uploads/${file.filename}`);
  const result = await query(
    `update disputes set evidence_urls = coalesce(evidence_urls, array[]::text[]) || $2::text[],
     updated_at = now() where id = $1 returning *`,
    [req.params.id, urls],
  );
  if (!result.rows[0]) throw notFound('Dispute not found');
  res.json({ success: true, dispute: result.rows[0] });
}

export async function resolveDispute(req, res) {
  const { resolution, refundAmount = 0 } = req.body || {};
  if (!resolution) throw badRequest('Resolution is required');
  const dispute = await transaction(async (client) => {
    const d = await client.query('select * from disputes where id = $1 for update', [req.params.id]);
    if (!d.rows[0]) throw notFound('Dispute not found');
    await client.query(
      `update disputes set status = 'resolved', resolution = $2, refund_amount = $3,
       resolved_by = $4, resolved_at = now(), updated_at = now() where id = $1`,
      [req.params.id, resolution, refundAmount, req.user.id],
    );
    if (refundAmount > 0) {
      const payment = await client.query(
        `select * from payments where job_id = $1 and escrow_status in ('held', 'frozen') order by created_at desc limit 1`,
        [d.rows[0].job_id],
      );
      if (payment.rows[0]) {
        await client.query(
          `insert into escrow_transactions (job_id, payment_id, type, amount, status)
           values ($1, $2, 'refund', $3, 'pending')`,
          [d.rows[0].job_id, payment.rows[0].id, refundAmount],
        );
      }
    }
    return d.rows[0];
  });
  emitEvent('dispute:resolved', { jobId: dispute.job_id, disputeId: req.params.id }, `job:${dispute.job_id}`);
  res.json({ success: true });
}
