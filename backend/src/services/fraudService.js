import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { auditLog } from './auditService.js';
import { calculateCommission, getPaymentSettings } from './financeService.js';
import { sendFraudWarningEmail } from './emailService.js';

const BYPASS_PATTERNS = [
  ['phone_number', /(?:\+?254|0)?[17]\d{8}\b|(?:\+?254|0)?\d{9,12}/i, 15, 'high'],
  ['whatsapp', /wa\.me|whatsapp|whats\s*app/i, 25, 'critical'],
  ['telegram', /telegram|t\.me\/|@\w{4,}/i, 20, 'high'],
  ['email_address', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, 15, 'high'],
  ['mpesa_number', /\b(?:paybill|till|m-?pesa|mpesa|send\s+money|lipa\s+na)\b/i, 30, 'critical'],
  ['bank_account', /\b(?:bank|account\s*no|swift|iban|routing)\b/i, 25, 'critical'],
  ['pay_cash', /\b(?:pay\s*cash|cash\s*only|cash\s*payment)\b/i, 25, 'critical'],
  ['send_directly', /\b(?:send\s+directly|pay\s+directly|direct\s+payment|pay\s+me\s+direct)\b/i, 30, 'critical'],
  ['outside_app', /\b(?:outside\s*(?:the\s*)?app|off[\s-]?platform|bypass\s*(?:the\s*)?app)\b/i, 35, 'critical'],
  ['call_me', /\b(?:call\s+me|phone\s+me|ring\s+me|text\s+me|sms\s+me)\b/i, 15, 'high'],
  ['pay_later', /\b(?:pay\s+later|i(?:'ll| will)\s+pay\s+later)\b/i, 10, 'medium'],
  ['use_my_number', /\b(?:use\s+my\s+number|my\s+number\s+is)\b/i, 20, 'high'],
  ['external_url', /https?:\/\/|www\.|\.com\b|\.co\.ke\b|bit\.ly|tinyurl/i, 15, 'high'],
  ['social_media', /\b(?:facebook|instagram|tiktok|twitter|x\.com|linkedin)\b/i, 10, 'medium'],
];

const TRUST_PENALTIES = { critical: 35, high: 20, medium: 10, low: 5 };
const TRUST_BONUSES = { completed_job: 5, positive_review: 3, verified_identity: 10, long_term: 2 };
const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;

export function riskLevelFromScore(score) {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'medium';
  return 'low';
}

export function detectBypass(content = '') {
  const text = String(content || '');
  let totalDelta = 0;
  const matches = [];
  for (const [type, pattern, delta, severity] of BYPASS_PATTERNS) {
    if (pattern.test(text)) {
      matches.push({ type, severity, delta });
      totalDelta += delta;
    }
  }
  if (!matches.length) return { isBypass: false, severity: 'low', scoreDelta: 0, matches: [] };
  const top = matches.sort((a, b) => b.delta - a.delta)[0];
  return {
    isBypass: true,
    type: top.type,
    severity: top.severity,
    scoreDelta: Math.min(100, totalDelta),
    matches,
  };
}

async function sendNotification({ userId, type, title, body, data = {} }) {
  if (!userId) return;
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [userId, type, title, body, JSON.stringify(data)],
  );
}

async function notifyAdmins({ title, body, data = {} }) {
  const admins = await query(`select id from users where role = 'admin' and status = 'active'`);
  for (const admin of admins.rows) {
    await sendNotification({ userId: admin.id, type: 'admin_fraud_alert', title, body, data });
  }
}

export async function adjustTrustScore({ userId, delta, reason, sourceType, sourceId = null }) {
  if (!userId || !delta) return null;
  return transaction(async (client) => {
    const current = await client.query(
      `select score from trust_scores where user_id = $1 for update`,
      [userId],
    );
    const previous = Number(current.rows[0]?.score ?? 100);
    const next = Math.max(0, Math.min(100, previous + delta));
    await client.query(
      `insert into trust_score_history (user_id, previous_score, new_score, delta, reason, source_type, source_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, previous, next, delta, reason, sourceType, sourceId],
    );
    await client.query(
      `update trust_scores set score = $2, updated_at = now() where user_id = $1`,
      [userId, next],
    );
    await client.query(`update users set trust_score = $2, updated_at = now() where id = $1`, [userId, next]);
    if (delta < 0) {
      await client.query(`update fundis set trust_score = $2, updated_at = now() where user_id = $1`, [userId, next]);
    }
    return { previous, next, delta };
  });
}

export async function updateFraudScore({ userId, scoreDelta, source, patternType = null, jobId = null, contentPreview = '', metadata = {} }) {
  if (!userId || !scoreDelta) return null;
  return transaction(async (client) => {
    const existing = await client.query(
      `select fraud_score, detection_count from user_fraud_scores where user_id = $1 for update`,
      [userId],
    );
    const previous = Number(existing.rows[0]?.fraud_score ?? 0);
    const next = Math.min(100, previous + scoreDelta);
    const riskLevel = riskLevelFromScore(next);
    await client.query(
      `insert into user_fraud_scores (user_id, fraud_score, risk_level, detection_count, last_detection_at, updated_at)
       values ($1, $2, $3, 1, now(), now())
       on conflict (user_id) do update set
         fraud_score = $2,
         risk_level = $3,
         detection_count = user_fraud_scores.detection_count + 1,
         last_detection_at = now(),
         updated_at = now()`,
      [userId, next, riskLevel],
    );
    await client.query(
      `insert into fraud_detection_events (user_id, job_id, event_type, source, pattern_type, score_delta, fraud_score_after, content_preview, metadata)
       values ($1, $2, 'pattern_detected', $3, $4, $5, $6, $7, $8::jsonb)`,
      [userId, jobId, source, patternType, scoreDelta, next, contentPreview.slice(0, 200), JSON.stringify(metadata)],
    );
    return { previous, next, riskLevel };
  });
}

export async function recordFraudAlert({ jobId = null, userId, userRole, content, detection, source = 'chat' }) {
  const scoreDelta = detection.scoreDelta || TRUST_PENALTIES[detection.severity] || 10;
  const fraudResult = await updateFraudScore({
    userId,
    scoreDelta,
    source,
    patternType: detection.type,
    jobId,
    contentPreview: content,
    metadata: { severity: detection.severity, matches: detection.matches },
  });
  const alert = await query(
    `insert into fraud_alerts (job_id, user_id, user_role, alert_type, detected_pattern, severity, message_preview, fraud_score, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'open') returning *`,
    [
      jobId,
      userId,
      userRole,
      source === 'chat' ? 'chat_bypass_attempt' : 'content_bypass_attempt',
      detection.type,
      detection.severity,
      content.slice(0, 200),
      fraudResult?.next ?? scoreDelta,
    ],
  );
  const penalty = -(TRUST_PENALTIES[detection.severity] || 10);
  await adjustTrustScore({
    userId,
    delta: penalty,
    reason: `Fraud alert: ${detection.type}`,
    sourceType: 'fraud_alert',
    sourceId: alert.rows[0]?.id,
  });
  await auditLog({
    userId,
    action: 'fraud.detected',
    entityType: 'fraud_alert',
    entityId: alert.rows[0]?.id,
    metadata: { jobId, type: detection.type, severity: detection.severity },
  });
  await sendNotification({
    userId,
    type: 'fraud_warning',
    title: 'Off-platform activity detected',
    body: 'Sharing contact or payment details outside PataFundi is not allowed and may affect your trust score.',
    data: { jobId, alertId: alert.rows[0]?.id },
  });
  await notifyAdmins({
    title: `Fraud alert: ${detection.severity}`,
    body: `User ${userId} triggered ${detection.type} detection`,
    data: { alertId: alert.rows[0]?.id, jobId, userId },
  });
  return alert.rows[0];
}

export async function scanContent({ content, userId, userRole, jobId = null, source = 'chat' }) {
  const detection = detectBypass(content);
  if (!detection.isBypass) return { blocked: false, detection };
  await recordFraudAlert({ jobId, userId, userRole, content, detection, source });
  return { blocked: true, detection };
}

export async function createExpectedCommission({ jobId, fundiId, customerId, amount, client = null }) {
  const db = client || { query };
  const settings = await getPaymentSettings(client);
  const commission = calculateCommission({ amount, settings });
  await db.query(
    `insert into expected_commissions (job_id, fundi_id, customer_id, job_amount, commission_rate, expected_commission)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (job_id) do update set
       job_amount = excluded.job_amount,
       commission_rate = excluded.commission_rate,
       expected_commission = excluded.expected_commission,
       updated_at = now()`,
    [jobId, fundiId, customerId, amount, commission.commissionRate, commission.platformCommission],
  );
}

export async function markCommissionPaymentReceived(jobId, client = null) {
  const db = client || { query };
  await db.query(
    `update expected_commissions set payment_received = true, escrow_funded = true, updated_at = now() where job_id = $1`,
    [jobId],
  );
}

export async function markCommissionCustomerConfirmed(jobId, client = null) {
  const db = client || { query };
  await db.query(
    `update expected_commissions set customer_confirmed = true, updated_at = now() where job_id = $1`,
    [jobId],
  );
}

export async function checkCommissionProtection() {
  const suspicious = await query(
    `select ec.*, j.status as job_status, j.payment_status, u.email as fundi_email
     from expected_commissions ec
     join jobs j on j.id = ec.job_id
     join users u on u.id = ec.fundi_id
     where ec.flagged_suspicious = false
       and j.status = 'completed'
       and j.customer_completion_confirmed = true
       and ec.payment_received = false
       and ec.created_at < now() - interval '2 hours'`,
  );
  for (const row of suspicious.rows) {
    await flagSuspiciousCommission(row);
  }
  return suspicious.rows.length;
}

async function flagSuspiciousCommission(row) {
  await transaction(async (client) => {
    await client.query(
      `update expected_commissions set flagged_suspicious = true, flagged_at = now(), updated_at = now() where id = $1`,
      [row.id],
    );
    await client.query(
      `insert into commission_debts (user_id, job_id, amount, status, reason)
       values ($1, $2, $3, 'pending', $4)`,
      [
        row.fundi_id,
        row.job_id,
        row.expected_commission,
        'Job completed without platform payment — commission owed',
      ],
    );
    const alert = await client.query(
      `insert into fraud_alerts (job_id, user_id, user_role, alert_type, detected_pattern, severity, message_preview, fraud_score, status)
       values ($1, $2, 'fundi', 'commission_bypass', 'unpaid_completion', 'critical', $3, 80, 'open') returning *`,
      [row.job_id, row.fundi_id, `Job ${row.job_id} completed but no escrow payment received`],
    );
    await adjustTrustScore({
      userId: row.fundi_id,
      delta: -25,
      reason: 'Commission bypass suspected',
      sourceType: 'commission_protection',
      sourceId: row.job_id,
    });
    await auditLog({
      userId: row.fundi_id,
      action: 'fraud.commission_bypass',
      entityType: 'job',
      entityId: row.job_id,
      metadata: { expectedCommission: row.expected_commission },
    });
    await notifyAdmins({
      title: 'Commission bypass suspected',
      body: `Job ${row.job_id} completed without platform payment. Fundi: ${row.fundi_email}`,
      data: { jobId: row.job_id, alertId: alert.rows[0]?.id },
    });
    const user = await client.query('select email from users where id = $1', [row.fundi_id]);
    if (user.rows[0]?.email) {
      await sendFraudWarningEmail({
        to: user.rows[0].email,
        subject: 'Commission protection alert — PataFundi',
        body: 'A job was marked complete without platform payment. Outstanding commission may be deducted from your next payout.',
      }).catch(() => {});
    }
  });
}

export async function getOutstandingCommissionDebt(userId, client = null) {
  const db = client || { query };
  const result = await db.query(
    `select coalesce(sum(amount), 0)::numeric as total
     from commission_debts
     where user_id = $1 and status in ('pending', 'invoiced', 'overdue')`,
    [userId],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function calculateCommissionDebtDeduction(userId, payoutAmount, client = null) {
  const debt = await getOutstandingCommissionDebt(userId, client);
  const deduct = Math.min(debt, payoutAmount);
  return { netPayout: payoutAmount - deduct, deducted: deduct };
}

export async function applyCommissionDebtDeduction({ userId, payoutAmount, payoutId, client }) {
  const debt = await getOutstandingCommissionDebt(userId, client);
  if (debt <= 0) return { netPayout: payoutAmount, deducted: 0, debts: [] };
  const deduct = Math.min(debt, payoutAmount);
  const debts = await client.query(
    `select * from commission_debts
     where user_id = $1 and status in ('pending', 'invoiced', 'overdue')
     order by created_at asc for update`,
    [userId],
  );
  let remaining = deduct;
  const settled = [];
  for (const d of debts.rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(d.amount));
    const newStatus = take >= Number(d.amount) ? 'deducted' : 'pending';
    await client.query(
      `update commission_debts set status = $2, deducted_from_payout_id = $3, paid_at = case when $2 = 'deducted' then now() else paid_at end, updated_at = now()
       where id = $1`,
      [d.id, newStatus, payoutId],
    );
    await client.query(
      `insert into revenue_ledger (payout_id, job_id, user_id, entry_type, amount, metadata)
       values ($1, $2, $3, 'commission', $4, $5::jsonb)`,
      [payoutId, d.job_id, userId, take, JSON.stringify({ source: 'payout_deduction', debtId: d.id })],
    );
    await client.query(
      `insert into accounting_ledger (source_type, source_id, debit_account, credit_account, amount, metadata)
       values ('payout_deduction', $1, 'fundi_wallet', 'platform_revenue', $2, $3::jsonb)`,
      [payoutId, take, JSON.stringify({ debtId: d.id, jobId: d.job_id })],
    );
    remaining -= take;
    settled.push({ debtId: d.id, amount: take });
  }
  await auditLog({
    userId,
    action: 'commission.debt_deducted',
    entityType: 'payout',
    entityId: payoutId,
    metadata: { deducted: deduct, settled },
  });
  await sendNotification({
    userId,
    type: 'commission_deducted',
    title: 'Commission recovered from payout',
    body: `KES ${deduct.toFixed(2)} was deducted from your payout to settle outstanding commission.`,
    data: { payoutId, deducted: deduct },
  });
  return { netPayout: payoutAmount - deduct, deducted: deduct, debts: settled };
}

export async function runPatternDetection() {
  const patterns = [];

  const repeatPairs = await query(
    `select j.customer_id, j.fundi_id, count(*)::int as job_count,
            count(p.id) filter (where p.status = 'completed')::int as paid_count
     from jobs j
     left join payments p on p.job_id = j.id and p.status = 'completed'
     where j.status = 'completed' and j.fundi_id is not null
     group by j.customer_id, j.fundi_id
     having count(*) >= 3 and count(p.id) filter (where p.status = 'completed') = 0`,
  );
  for (const row of repeatPairs.rows) {
    patterns.push({ type: 'repeat_unpaid_pair', userId: row.fundi_id, jobId: null, scoreDelta: 20 });
    patterns.push({ type: 'repeat_unpaid_pair', userId: row.customer_id, jobId: null, scoreDelta: 15 });
  }

  const fastCompletions = await query(
    `select j.id, j.fundi_id from jobs j
     join job_timeline t1 on t1.job_id = j.id and t1.event_type = 'work_started'
     join job_timeline t2 on t2.job_id = j.id and t2.event_type = 'work_completed'
     where t2.created_at - t1.created_at < interval '5 minutes'
       and j.created_at > now() - interval '7 days'`,
  );
  for (const row of fastCompletions.rows) {
    patterns.push({ type: 'fast_completion', userId: row.fundi_id, jobId: row.id, scoreDelta: 10 });
  }

  const chatAbuse = await query(
    `select user_id, count(*)::int as cnt from fraud_alerts
     where alert_type = 'chat_bypass_attempt' and created_at > now() - interval '7 days'
     group by user_id having count(*) >= 3`,
  );
  for (const row of chatAbuse.rows) {
    patterns.push({ type: 'repeated_chat_bypass', userId: row.user_id, jobId: null, scoreDelta: 15 });
  }

  for (const p of patterns) {
    await updateFraudScore({
      userId: p.userId,
      scoreDelta: p.scoreDelta,
      source: 'pattern',
      patternType: p.type,
      jobId: p.jobId,
      metadata: { automated: true },
    });
  }
  return patterns.length;
}

export async function verifyOtpWithLockout({ email, purpose, code, verifyFn }) {
  const row = await query(
    `select oc.id, oc.code_hash, oc.attempts, oc.locked_until, oc.user_id,
            u.email, u.full_name, u.phone, u.role, u.status, u.trust_score, u.email_verified_at
     from otp_codes oc join users u on u.id = oc.user_id
     where lower(u.email) = lower($1) and oc.purpose = $2 and oc.consumed_at is null and oc.expires_at > now()
     order by oc.created_at desc limit 1`,
    [email, purpose],
  );
  const otp = row.rows[0];
  if (!otp) return { ok: false, error: 'Invalid OTP code', locked: false };
  if (otp.locked_until && new Date(otp.locked_until) > new Date()) {
    return { ok: false, error: 'OTP locked due to too many attempts. Try again later.', locked: true };
  }
  const valid = await verifyFn(otp);
  if (valid) {
    await query('update otp_codes set consumed_at = now() where id = $1', [otp.id]);
    return { ok: true, otp, user: otp };
  }
  const attempts = Number(otp.attempts) + 1;
  const lockedUntil = attempts >= MAX_OTP_ATTEMPTS
    ? new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000).toISOString()
    : null;
  await query(
    `update otp_codes set attempts = $2, locked_until = $3 where id = $1`,
    [otp.id, attempts, lockedUntil],
  );
  if (lockedUntil) {
    await auditLog({ userId: otp.user_id, action: 'auth.otp_locked', entityType: 'otp', entityId: otp.id });
  }
  return {
    ok: false,
    error: lockedUntil ? 'Too many OTP attempts. Account locked temporarily.' : 'Invalid OTP code',
    locked: Boolean(lockedUntil),
    attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - attempts),
  };
}

export async function verifyJobCompletionOtp({ jobId, otp, verifyHash }) {
  const job = await query(
    `select id, customer_id, completion_otp_hash, completion_otp_attempts, completion_otp_locked_until
     from jobs where id = $1`,
    [jobId],
  );
  const row = job.rows[0];
  if (!row) return { ok: false, error: 'Job not found' };
  if (row.completion_otp_locked_until && new Date(row.completion_otp_locked_until) > new Date()) {
    return { ok: false, error: 'Completion OTP locked. Try again later.', locked: true };
  }
  const valid = row.completion_otp_hash && await verifyHash(row.completion_otp_hash, otp);
  if (valid) {
    await query(
      `update jobs set completion_otp_attempts = 0, completion_otp_locked_until = null where id = $1`,
      [jobId],
    );
    return { ok: true };
  }
  const attempts = Number(row.completion_otp_attempts) + 1;
  const lockedUntil = attempts >= MAX_OTP_ATTEMPTS
    ? new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000).toISOString()
    : null;
  await query(
    `update jobs set completion_otp_attempts = $2, completion_otp_locked_until = $3 where id = $1`,
    [jobId, attempts, lockedUntil],
  );
  return {
    ok: false,
    error: lockedUntil ? 'Too many completion OTP attempts.' : 'Invalid completion OTP',
    locked: Boolean(lockedUntil),
  };
}

export function webhookCallbackHash(checkoutRequestId, receipt, rawBody) {
  return crypto.createHash('sha256').update(`${checkoutRequestId}:${receipt || ''}:${rawBody || ''}`).digest('hex');
}

export async function isWebhookReplay({ checkoutRequestId, receipt, rawBody, client }) {
  const db = client || { query };
  const hash = webhookCallbackHash(checkoutRequestId, receipt, rawBody);
  const existing = await db.query(
    `select id from processed_webhook_callbacks where callback_hash = $1 or checkout_request_id = $2`,
    [hash, checkoutRequestId],
  );
  return Boolean(existing.rows[0]);
}

export async function recordWebhookProcessed({ checkoutRequestId, receipt, paymentId, rawBody, client }) {
  const db = client || { query };
  const hash = webhookCallbackHash(checkoutRequestId, receipt, rawBody);
  await db.query(
    `insert into processed_webhook_callbacks (checkout_request_id, mpesa_receipt_number, payment_id, callback_hash)
     values ($1, $2, $3, $4) on conflict (callback_hash) do nothing`,
    [checkoutRequestId, receipt || null, paymentId, hash],
  );
}

export async function rewardTrust({ userId, reason, bonusKey }) {
  const bonus = TRUST_BONUSES[bonusKey] || 2;
  return adjustTrustScore({ userId, delta: bonus, reason, sourceType: bonusKey });
}
