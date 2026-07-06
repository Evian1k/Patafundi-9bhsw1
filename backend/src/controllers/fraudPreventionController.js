/**
 * Fraud Prevention Controller — 7 systems API
 */
import {
  recordDeviceFingerprint, getDeviceHistory,
  checkIpReputation, reportIp,
  recordLoginEvent,
  validateGpsLocation,
  checkBlacklist, checkBlacklistBatch, addToBlacklist, removeFromBlacklist, listBlacklist,
  calculateBehavioralRisk, getBehavioralRisk,
  recordPaymentFraud, checkPaymentFraudPatterns,
  getFraudPreventionOverview,
} from '../services/fraudPreventionService.js';

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// ── Device Fingerprinting ──────────────────────────────────────
export async function submitDeviceFingerprint(req, res) {
  const result = await recordDeviceFingerprint(req.user.id, req.body || {});
  res.json({ success: true, ...result });
}

export async function getDeviceHistoryHandler(req, res) {
  const devices = await getDeviceHistory(req.params.userId || req.user.id);
  res.json({ success: true, devices });
}

// ── IP Reputation ───────────────────────────────────────────────
export async function getIpReputation(req, res) {
  const result = await checkIpReputation(req.params.ip);
  res.json({ success: true, ...result });
}

export async function reportIpHandler(req, res) {
  await reportIp(req.body.ip, req.body.reason);
  res.json({ success: true, message: 'IP reported' });
}

// ── Impossible Travel / Login History ──────────────────────────
export async function getLoginHistory(req, res) {
  const { query: q } = await import('../db.js');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await q(
    'select * from login_history where user_id = $1 order by created_at desc limit $2',
    [req.params.userId || req.user.id, limit],
  );
  res.json({ success: true, logins: result.rows });
}

// ── GPS Spoof Detection ────────────────────────────────────────
export async function submitGpsValidation(req, res) {
  const result = await validateGpsLocation(req.user.id, req.body || {});
  res.json({ success: true, ...result });
}

export async function getGpsHistory(req, res) {
  const { query: q } = await import('../db.js');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await q(
    'select * from gps_validations where fundi_id = $1 order by created_at desc limit $2',
    [req.params.userId, limit],
  );
  res.json({ success: true, validations: result.rows });
}

// ── Blacklist ──────────────────────────────────────────────────
export async function checkBlacklistHandler(req, res) {
  const result = await checkBlacklist(req.body.type, req.body.value);
  res.json({ success: true, isBlacklisted: Boolean(result), details: result });
}

export async function checkBlacklistBatchHandler(req, res) {
  const result = await checkBlacklistBatch(req.body.items || []);
  res.json({ success: true, results: result });
}

export async function addBlacklistHandler(req, res) {
  const { type, value, reason, details, isPermanent, expiresAt } = req.body || {};
  if (!type || !value || !reason) throw badRequest('type, value, reason required');
  const result = await addToBlacklist(type, value, reason, details, isPermanent, expiresAt, req.user.id);
  res.status(201).json({ success: true, entry: result });
}

export async function removeBlacklistHandler(req, res) {
  const result = await removeFromBlacklist(req.body.type, req.body.value, req.user.id);
  res.json({ success: true, ...result });
}

export async function listBlacklistHandler(req, res) {
  const result = await listBlacklist(req.query.type, Math.min(Number(req.query.limit) || 100, 500));
  res.json({ success: true, entries: result });
}

// ── Behavioral Risk ────────────────────────────────────────────
export async function getBehavioralRiskHandler(req, res) {
  const result = await getBehavioralRisk(req.params.userId || req.user.id);
  res.json({ success: true, risk: result });
}

export async function recalculateRiskHandler(req, res) {
  const result = await calculateBehavioralRisk(req.params.userId || req.user.id);
  res.json({ success: true, ...result });
}

// ── Payment Fraud ──────────────────────────────────────────────
export async function getPaymentFraudHandler(req, res) {
  const { query: q } = await import('../db.js');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await q('select * from payment_fraud_monitoring order by detected_at desc limit $1', [limit]);
  res.json({ success: true, fraud: result.rows });
}

export async function checkPaymentFraudHandler(req, res) {
  const { userId, mpesaNumber } = req.body || {};
  if (!userId) throw badRequest('userId required');
  const patterns = await checkPaymentFraudPatterns(userId, mpesaNumber);
  res.json({ success: true, patterns });
}

export async function resolvePaymentFraudHandler(req, res) {
  const { query: q } = await import('../db.js');
  const { status } = req.body || {};
  if (!['confirmed', 'false_positive', 'resolved'].includes(status)) throw badRequest('Invalid status');
  await q('update payment_fraud_monitoring set status = $2, resolved_at = now(), resolved_by = $3 where id = $1', [req.params.id, status, req.user.id]);
  res.json({ success: true, message: 'Payment fraud case updated' });
}

// ── Overview Dashboard ─────────────────────────────────────────
export async function getFraudPreventionOverviewHandler(_req, res) {
  const overview = await getFraudPreventionOverview();
  res.json({ success: true, overview });
}
