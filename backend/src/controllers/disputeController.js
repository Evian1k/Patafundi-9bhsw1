import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { uploadPrivateFile, getSignedAccessUrl } from '../services/storageService.js';
import { mapMulterFiles } from '../middleware/upload.js';

function canAccessJob(user, job) {
  return user.role === 'admin' || job.customer_id === user.id || job.fundi_id === user.id;
}

export async function createDispute(req, res) {
  const { jobId, reason, evidenceUrls = [] } = req.body || {};
  if (!jobId || !reason) throw badRequest('Job and reason are required');
  const dispute = await transaction(async (client) => {
    const job = await client.query('select customer_id, fundi_id from jobs where id = $1 for update', [jobId]);
    if (!job.rows[0]) throw notFound('Job not found');
    if (!canAccessJob(req.user, job.rows[0])) throw forbidden('Not allowed to dispute this job');
    const existing = await client.query(
      `select id from disputes where job_id = $1 and status in ('open', 'under_review') limit 1`,
      [jobId],
    );
    if (existing.rows[0]) throw badRequest('This job already has an open dispute');
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
  const files = mapMulterFiles(req.files);
  if (!files.length) throw badRequest('At least one evidence file is required');

  const dispute = await query(
    `select d.*, j.customer_id, j.fundi_id
     from disputes d join jobs j on j.id = d.job_id
     where d.id = $1`,
    [req.params.id],
  );
  if (!dispute.rows[0]) throw notFound('Dispute not found');
  if (!canAccessJob(req.user, dispute.rows[0])) throw forbidden('Not allowed to update this dispute');
  if (dispute.rows[0].status !== 'open' && dispute.rows[0].status !== 'under_review') throw badRequest('Dispute is closed');

  const uploadedFiles = [];
  for (const file of files) {
    const uploaded = await uploadPrivateFile({
      folder: `disputes/${req.params.id}`,
      file,
    });
    const row = await query(
      `insert into dispute_files (dispute_id, uploaded_by, r2_key, thumb_r2_key, mime_type, file_size, original_name, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'active') returning *`,
      [
        req.params.id,
        req.user.id,
        uploaded.r2Key,
        uploaded.thumbR2Key,
        uploaded.mimeType,
        uploaded.fileSize,
        file.originalname,
      ],
    );
    uploadedFiles.push({
      id: row.rows[0].id,
      signedUrl: await getSignedAccessUrl(uploaded.r2Key),
      expiresIn: 900,
    });
  }

  const legacyUrls = uploadedFiles.map((f) => f.signedUrl);
  const result = await query(
    `update disputes set evidence_urls = coalesce(evidence_urls, array[]::text[]) || $2::text[],
     updated_at = now() where id = $1 returning *`,
    [req.params.id, legacyUrls],
  );

  res.json({ success: true, dispute: result.rows[0], files: uploadedFiles });
}

export async function resolveDispute(req, res) {
  const { resolution, refundAmount = 0 } = req.body || {};
  if (!resolution) throw badRequest('Resolution is required');
  const dispute = await transaction(async (client) => {
    const d = await client.query('select * from disputes where id = $1 for update', [req.params.id]);
    if (!d.rows[0]) throw notFound('Dispute not found');
    if (!['open', 'under_review'].includes(d.rows[0].status)) throw badRequest('Dispute is already closed');
    const refund = Number(refundAmount || 0);
    if (!Number.isFinite(refund) || refund < 0) throw badRequest('Refund amount must be zero or greater');
    const payment = await client.query(
      `select * from payments where job_id = $1 and escrow_status in ('held', 'frozen') order by created_at desc limit 1 for update`,
      [d.rows[0].job_id],
    );
    if (refund > 0) {
      if (!payment.rows[0]) throw badRequest('No refundable escrow found');
      if (refund > Number(payment.rows[0].amount)) throw badRequest('Refund cannot exceed held escrow');
        await client.query(
          `insert into escrow_transactions (job_id, payment_id, type, amount, status)
           values ($1, $2, 'refund', $3, 'pending')`,
          [d.rows[0].job_id, payment.rows[0].id, refund],
        );
      await client.query(`update payments set escrow_status = 'refunded', updated_at = now() where id = $1`, [payment.rows[0].id]);
      await client.query(`update jobs set escrow_status = 'refunded', payment_status = 'failed', updated_at = now() where id = $1`, [d.rows[0].job_id]);
    } else if (payment.rows[0]) {
      await client.query(`update payments set escrow_status = 'held', updated_at = now() where id = $1`, [payment.rows[0].id]);
      await client.query(`update jobs set escrow_status = 'held', updated_at = now() where id = $1`, [d.rows[0].job_id]);
    }
    await client.query(
      `update disputes set status = 'resolved', resolution = $2, refund_amount = $3,
       resolved_by = $4, resolved_at = now(), updated_at = now() where id = $1`,
      [req.params.id, resolution, refund, req.user.id],
    );
    return d.rows[0];
  });
  emitEvent('dispute:resolved', { jobId: dispute.job_id, disputeId: req.params.id }, `job:${dispute.job_id}`);
  res.json({ success: true });
}
