/**
 * Enterprise Controller — exposes all 7 new enterprise systems via API.
 */
import {
  calculateQualityScore, getQualityScore, recalculateAllQualityScores,
  createInternalNote, listInternalNotes, deleteInternalNote,
  createReferral, completeReferral, getReferralStats,
  updateLoyaltyScore, getLoyaltyScore,
  createEscalation, resolveEscalation, listEscalations,
  createSlaTrack, getSlaBreaches,
  recordCommissionChange, getCommissionHistory,
} from '../services/enterpriseService.js';
import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';

// ── Quality Score ──
export async function getFundiQuality(req, res) {
  const score = await getQualityScore(req.params.fundiId);
  res.json({ success: true, score });
}

export async function recalculateQuality(req, res) {
  const count = await recalculateAllQualityScores();
  res.json({ success: true, recalculated: count });
}

export async function calculateFundiQuality(req, res) {
  const result = await calculateQualityScore(req.params.fundiId);
  res.json({ success: true, result });
}

// ── Internal Notes ──
export async function createNote(req, res) {
  const note = await createInternalNote({
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    authorId: req.user.id,
    note: req.body.note,
    isPinned: req.body.isPinned,
  });
  res.status(201).json({ success: true, note });
}

export async function listNotes(req, res) {
  const notes = await listInternalNotes(req.params.entityType, req.params.entityId);
  res.json({ success: true, notes });
}

export async function deleteNote(req, res) {
  await deleteInternalNote(req.params.id, req.user.id);
  res.json({ success: true });
}

// ── Referrals ──
export async function getMyReferrals(req, res) {
  const stats = await getReferralStats(req.user.id);
  const code = `PF-${req.user.id.slice(0, 8).toUpperCase()}`;
  res.json({ success: true, referralCode: code, stats });
}

export async function listReferrals(req, res) {
  const result = await query(
    `select r.*, ru.full_name as referrer_name, re.full_name as referee_name
     from referrals r
     join users ru on ru.id = r.referrer_id
     join users re on re.id = r.referee_id
     order by r.created_at desc limit 100`,
  );
  res.json({ success: true, referrals: result.rows });
}

// ── Loyalty ──
export async function getMyLoyalty(req, res) {
  const loyalty = await getLoyaltyScore(req.user.id);
  res.json({ success: true, loyalty });
}

export async function recalculateLoyalty(req, res) {
  const result = await updateLoyaltyScore(req.params.userId || req.user.id);
  res.json({ success: true, loyalty: result });
}

// ── Escalations ──
export async function createEscalationReq(req, res) {
  const esc = await createEscalation({
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    escalatedBy: req.user.id,
    fromRole: req.user.role,
    toRole: req.body.toRole,
    reason: req.body.reason,
  });
  res.status(201).json({ success: true, escalation: esc });
}

export async function resolveEscalationReq(req, res) {
  const esc = await resolveEscalation(req.params.id, req.user.id, req.body.resolutionNote);
  res.json({ success: true, escalation: esc });
}

export async function listEscalationsReq(req, res) {
  const escalations = await listEscalations({
    status: req.query.status,
    role: req.query.role,
  });
  res.json({ success: true, escalations });
}

// ── SLA ──
export async function getSlaBreachesReq(req, res) {
  const breaches = await getSlaBreaches();
  res.json({ success: true, breaches });
}

// ── Commission History ──
export async function getCommissionHistoryReq(req, res) {
  const history = await getCommissionHistory(req.query.scope, req.query.scopeValue);
  res.json({ success: true, history });
}

export async function updateCommissionRate(req, res) {
  const { scope, scopeValue, newRate, newType, reason } = req.body;
  if (!scope || newRate == null) throw badRequest('scope and newRate are required');

  // Get current rate from platform_settings
  const settings = await query(`select value from platform_settings where key = 'global'`);
  const current = settings.rows[0]?.value?.payments || {};
  const oldRate = scope === 'global' ? current.commissionRate : (current.categoryCommissionRates?.[scopeValue] || current.commissionRate);
  const oldType = current.commissionType;

  // Update platform_settings
  if (scope === 'global') {
    current.commissionRate = Number(newRate);
    if (newType) current.commissionType = newType;
  } else if (scope === 'category') {
    if (!current.categoryCommissionRates) current.categoryCommissionRates = {};
    current.categoryCommissionRates[scopeValue] = Number(newRate);
  }

  await query(
    `update platform_settings set value = jsonb_set(value, '{payments}', $2::jsonb) where key = 'global'`,
    [JSON.stringify(current)],
  );

  // Record the change
  await recordCommissionChange({
    changedBy: req.user.id,
    scope,
    scopeValue,
    oldRate,
    newRate: Number(newRate),
    oldType,
    newType: newType || oldType,
    reason,
  });

  res.json({ success: true, message: 'Commission rate updated' });
}

// ── Commission Simulator ──
export async function simulateCommission(req, res) {
  const { jobAmount, category, commissionRate } = req.body;
  if (!jobAmount || jobAmount <= 0) throw badRequest('jobAmount must be > 0');

  // Get current settings or use provided rate
  let rate = Number(commissionRate);
  if (!rate) {
    const settings = await query(`select value from platform_settings where key = 'global'`);
    const payments = settings.rows[0]?.value?.payments || {};
    rate = Number(payments.categoryCommissionRates?.[category] || payments.commissionRate || 0.15);
  }

  const platformEarnings = Math.round(Number(jobAmount) * rate * 100) / 100;
  const fundiEarnings = Math.round((Number(jobAmount) - platformEarnings) * 100) / 100;

  res.json({
    success: true,
    simulation: {
      jobAmount: Number(jobAmount),
      category: category || 'default',
      commissionRate: rate,
      commissionPercent: (rate * 100).toFixed(1) + '%',
      platformEarnings,
      fundiEarnings,
    },
  });
}
