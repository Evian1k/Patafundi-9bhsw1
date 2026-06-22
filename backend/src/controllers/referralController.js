/**
 * Referral Controller — Voucher-based referral system
 *
 * Endpoints (all require auth unless noted):
 *   GET    /api/referrals/me                    — user's dashboard (code, vouchers, history)
 *   POST   /api/referrals/validate              — validate a code (no consumption)
 *   POST   /api/referrals/campaigns             — super_admin: create campaign
 *   GET    /api/referrals/campaigns             — list campaigns
 *   PATCH  /api/referrals/campaigns/:id/status  — super_admin: pause/resume/disable
 *   GET    /api/referrals/analytics             — staff: analytics dashboard
 *   GET    /api/referrals/fraud                 — staff: fraud events list
 *   PATCH  /api/referrals/fraud/:id/review      — fraud_analyst: review fraud event
 */
import {
  getMyReferralDashboard,
  validateReferralCode,
  listCampaigns,
  createCampaign,
  updateCampaignStatus,
  getReferralAnalytics,
  getFraudEvents,
  reviewFraudEvent,
} from '../services/referralService.js';

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function notFound(msg) {
  const e = new Error(msg);
  e.status = 404;
  return e;
}

// ============================================================
// USER ENDPOINTS
// ============================================================

/** GET /api/referrals/me */
export async function getMyReferrals(req, res) {
  const dashboard = await getMyReferralDashboard(req.user.id);
  res.json({ success: true, ...dashboard });
}

/** POST /api/referrals/validate — validate a code (does NOT consume) */
export async function validateReferral(req, res) {
  const { code } = req.body || {};
  if (!code) throw badRequest('Referral code required');
  const ipAddress = req.ip || req.socket?.remoteAddress;
  const deviceFingerprint = req.get('X-Device-Fingerprint');
  const result = await validateReferralCode(
    code,
    req.user.id,
    req.user.email,
    req.user.phone,
    ipAddress,
    deviceFingerprint,
  );
  res.json({ success: result.valid, ...result });
}

// ============================================================
// SUPER_ADMIN ENDPOINTS — CAMPAIGN MANAGEMENT
// ============================================================

/** GET /api/referrals/campaigns */
export async function listCampaignsHandler(_req, res) {
  const campaigns = await listCampaigns();
  res.json({ success: true, campaigns });
}

/** POST /api/referrals/campaigns — super_admin only */
export async function createCampaignHandler(req, res) {
  const { name, slug, description, campaignType, discountPercentage,
          maxDiscountKes, voucherValidityDays, minJobValueKes,
          startDate, endDate, maxRedemptions } = req.body || {};

  if (!name || !slug) throw badRequest('name and slug required');
  if (discountPercentage && (discountPercentage < 0 || discountPercentage > 100)) {
    throw badRequest('discountPercentage must be between 0 and 100');
  }
  if (campaignType && campaignType !== 'standard') {
    if (!startDate || !endDate) throw badRequest(`${campaignType} campaigns require start and end dates`);
  }

  const campaign = await createCampaign({
    name, slug, description, campaignType, discountPercentage,
    maxDiscountKes, voucherValidityDays, minJobValueKes,
    startDate, endDate, maxRedemptions,
    status: 'active',
  }, req.user.id);

  res.status(201).json({ success: true, campaign });
}

/** PATCH /api/referrals/campaigns/:id/status — super_admin only */
export async function updateCampaignStatusHandler(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!['active', 'paused', 'disabled', 'expired'].includes(status)) {
    throw badRequest('status must be active, paused, disabled, or expired');
  }
  const campaign = await updateCampaignStatus(id, status, req.user.id);
  res.json({ success: true, campaign });
}

// ============================================================
// STAFF ENDPOINTS — ANALYTICS & FRAUD REVIEW
// ============================================================

/** GET /api/referrals/analytics — staff with can_view_referral_analytics */
export async function analyticsHandler(req, res) {
  const period = req.query.period || '30d';
  const analytics = await getReferralAnalytics(period);
  res.json({ success: true, ...analytics });
}

/** GET /api/referrals/fraud — staff with can_view_referral_analytics */
export async function fraudListHandler(req, res) {
  const status = req.query.status || 'pending';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await getFraudEvents({ status, limit });
  res.json({ success: true, events });
}

/** PATCH /api/referrals/fraud/:id/review — fraud_analyst only */
export async function reviewFraudHandler(req, res) {
  const { id } = req.params;
  const { reviewStatus, reviewNotes } = req.body || {};
  if (!['confirmed_fraud', 'false_positive'].includes(reviewStatus)) {
    throw badRequest('reviewStatus must be confirmed_fraud or false_positive');
  }
  const event = await reviewFraudEvent(id, { reviewStatus, reviewNotes }, req.user.id);
  if (!event) throw notFound('Fraud event not found');
  res.json({ success: true, event });
}
