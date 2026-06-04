import { query } from '../db.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';

export async function supportTicket(req, res) {
  const { name = null, email = null, subject = null, message = '' } = req.body || {};
  const result = await query(
    `insert into support_tickets (name, email, subject, message) values ($1, $2, $3, $4) returning *`,
    [name, email, subject, message],
  );
  res.status(201).json({ success: true, ticket: result.rows[0] });
}

export async function fraudReport(req, res) {
  const content = req.body?.content || req.body?.messagePreview || '';
  const detection = detectBypass(content);
  if (detection.isBypass && req.body?.userId) {
    await recordFraudAlert({
      jobId: req.body.jobId || null,
      userId: req.body.userId,
      userRole: req.body.userRole || 'unknown',
      content,
      detection,
    });
  }
  res.json({ success: true, detection });
}

export async function genericList(key) {
  return (_req, res) => res.json({ success: true, [key]: [] });
}
