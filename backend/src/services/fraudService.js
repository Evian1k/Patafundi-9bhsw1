import { query } from '../db.js';

const bypassPatterns = [
  ['phone_number', /(?:\+?254|0)?\d{9,12}/i, 'high'],
  ['external_url', /https?:\/\/|www\.|\.com|\.co\.ke|bit\.ly|tinyurl/i, 'high'],
  ['messaging_app', /wa\.me|whatsapp|signal|telegram|viber/i, 'critical'],
  ['direct_payment', /\bm-pesa\b|\bmpesa\b|\bdaraja\b|paybill|till|cash|pay directly|skip.*app/i, 'critical'],
];

export function detectBypass(content = '') {
  for (const [type, pattern, severity] of bypassPatterns) {
    if (pattern.test(content)) return { isBypass: true, type, severity };
  }
  return { isBypass: false, severity: 'low' };
}

export async function recordFraudAlert({ jobId = null, userId, userRole, content, detection }) {
  await query(
    `insert into fraud_alerts (job_id, user_id, user_role, alert_type, detected_pattern, severity, message_preview)
     values ($1, $2, $3, 'chat_bypass_attempt', $4, $5, $6)`,
    [jobId, userId, userRole, detection.type, detection.severity, content.slice(0, 200)],
  );
  const penalty = detection.severity === 'critical' ? 35 : detection.severity === 'high' ? 20 : 10;
  await query(
    `update trust_scores set score = greatest(0, score - $2), updated_at = now()
     where user_id = $1`,
    [userId, penalty],
  );
}
