import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';
import { emitEvent } from '../realtime.js';

async function assertJobAccess(userId, role, jobId) {
  const result = await query('select customer_id, fundi_id from jobs where id = $1', [jobId]);
  const job = result.rows[0];
  if (!job) throw notFound('Job not found');
  if (role === 'admin') return job;
  if (job.customer_id === userId || job.fundi_id === userId) return job;
  throw forbidden('Not allowed to access this job chat');
}

export async function listMessages(req, res) {
  await assertJobAccess(req.user.id, req.user.role, req.params.jobId);
  const result = await query(
    `select m.*, u.full_name as sender_name
     from chat_messages m join users u on u.id = m.sender_id
     where m.job_id = $1 order by m.created_at asc`,
    [req.params.jobId],
  );
  res.json({ success: true, messages: result.rows });
}

export async function sendMessage(req, res) {
  const { body, imageUrl = null } = req.body || {};
  if (!body?.trim() && !imageUrl) throw badRequest('Message body is required');
  const job = await assertJobAccess(req.user.id, req.user.role, req.params.jobId);
  const detection = detectBypass(body || '');
  if (detection.isBypass) {
    await recordFraudAlert({
      jobId: req.params.jobId,
      userId: req.user.id,
      userRole: req.user.role,
      content: body || '',
      detection,
    });
    throw forbidden('Message blocked: off-platform contact or payment attempts are not allowed');
  }
  const result = await query(
    `insert into chat_messages (job_id, sender_id, body, image_url, bypass_flag)
     values ($1, $2, $3, $4, false) returning *`,
    [req.params.jobId, req.user.id, body?.trim() || '[image]', imageUrl],
  );
  const payload = {
    jobId: req.params.jobId,
    message: result.rows[0],
    recipientId: req.user.id === job.customer_id ? job.fundi_id : job.customer_id,
  };
  emitEvent('chat:message', payload, `job:${req.params.jobId}`);
  res.status(201).json({ success: true, message: result.rows[0] });
}

export async function markRead(req, res) {
  await assertJobAccess(req.user.id, req.user.role, req.params.jobId);
  await query(
    `update chat_messages set read_at = now()
     where job_id = $1 and sender_id <> $2 and read_at is null`,
    [req.params.jobId, req.user.id],
  );
  emitEvent('chat:read', { jobId: req.params.jobId, readerId: req.user.id }, `job:${req.params.jobId}`);
  res.json({ success: true });
}
