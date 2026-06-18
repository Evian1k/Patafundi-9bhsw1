import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';
import { emitEvent } from '../realtime.js';
import { uploadPrivateFile, getSignedAccessUrl } from '../services/storageService.js';
import { mapMulterFile } from '../middleware/upload.js';

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
  const { body } = req.body || {};
  const file = mapMulterFile(req.file);
  if (!body?.trim() && !file) throw badRequest('Message body or attachment is required');
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

  let attachmentId = null;
  let imageUrl = null;
  if (file) {
    const uploaded = await uploadPrivateFile({
      folder: `chat/${req.params.jobId}`,
      file,
    });
    const att = await query(
      `insert into chat_attachments (job_id, uploaded_by, r2_key, thumb_r2_key, mime_type, file_size, original_name, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'active') returning id`,
      [req.params.jobId, req.user.id, uploaded.r2Key, uploaded.thumbR2Key, uploaded.mimeType, uploaded.fileSize, file.originalname],
    );
    attachmentId = att.rows[0].id;
    imageUrl = await getSignedAccessUrl(uploaded.r2Key);
  }

  const result = await query(
    `insert into chat_messages (job_id, sender_id, body, image_url, bypass_flag)
     values ($1, $2, $3, $4, false) returning *`,
    [req.params.jobId, req.user.id, body?.trim() || '[image]', imageUrl],
  );

  if (attachmentId) {
    await query(`update chat_attachments set message_id = $2 where id = $1`, [attachmentId, result.rows[0].id]);
  }

  const payload = {
    jobId: req.params.jobId,
    message: { ...result.rows[0], attachmentId },
    recipientId: req.user.id === job.customer_id ? job.fundi_id : job.customer_id,
  };
  emitEvent('chat:message', payload, `job:${req.params.jobId}`);
  res.status(201).json({ success: true, message: payload.message });
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
