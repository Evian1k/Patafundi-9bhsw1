/**
 * Financial Controller — CEO-only endpoints for financial intelligence.
 *
 * All endpoints require super_admin role OR explicit financial_access_grants.
 * Staff (support, dispatch, fraud, finance_ops) CANNOT access these endpoints
 * unless the CEO has explicitly granted them access.
 *
 * Customers and fundis never see this data — it's internal company intelligence.
 */

import { query } from '../db.js';
import { requireFinancialAccess, sanitizeJobForCustomer, sanitizeJobForFundi, getActiveCampaign, recordRevenueEntry } from '../services/financialConfidentialityService.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

// ── CEO Financial Dashboard ───────────────────────────────────
export async function ceoFinancialDashboard(req, res) {
  // Double-check access (middleware already does this, but defense in depth)
  const hasAccess = await requireFinancialAccess('view_financial_reports').then(fn => new Promise((resolve) => {
    const mockRes = { status: () => ({ json: () => resolve(false) }) };
    const mockNext = () => resolve(true);
    fn(req, mockRes, mockNext);
  }));
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'CEO access required' });
  }

  const [
    revenueToday,
    revenueWeek,
    revenueMonth,
    revenueYear,
    escrowBalance,
    pendingPayouts,
    commissionEarned,
    gatewayFees,
    refunds,
    chargebacks,
    profitByCounty,
    profitByService,
    profitByTier,
    avgOrderValue,
  ] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'commission_earned' AND created_at::date = now()::date`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'commission_earned' AND created_at > now() - interval '7 days'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'commission_earned' AND date_trunc('month', created_at) = date_trunc('month', now())`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'commission_earned' AND date_trunc('year', created_at) = date_trunc('year', now())`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'escrow_held'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM payouts WHERE status = 'pending'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'commission_earned'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'gateway_fee'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'refund'`),
    query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) as total FROM revenue_ledger
           WHERE transaction_type = 'chargeback'`),
    query(`SELECT j.customer_address, COALESCE(SUM(rl.amount),0) as profit
           FROM revenue_ledger rl LEFT JOIN jobs j ON j.id = rl.job_id
           WHERE rl.transaction_type = 'commission_earned'
           GROUP BY j.customer_address ORDER BY profit DESC LIMIT 10`),
    query(`SELECT j.service_category, COALESCE(SUM(rl.amount),0) as profit
           FROM revenue_ledger rl LEFT JOIN jobs j ON j.id = rl.job_id
           WHERE rl.transaction_type = 'commission_earned'
           GROUP BY j.service_category ORDER BY profit DESC LIMIT 10`),
    query(`SELECT f.tier, COALESCE(SUM(rl.amount),0) as profit
           FROM revenue_ledger rl LEFT JOIN fundis f ON f.user_id = rl.fundi_id
           WHERE rl.transaction_type = 'commission_earned'
           GROUP BY f.tier ORDER BY profit DESC`),
    query(`SELECT COALESCE(AVG(customer_paid),0)::numeric(12,2) as avg
           FROM revenue_ledger WHERE transaction_type = 'customer_payment'`),
  ]);

  res.json({
    success: true,
    dashboard: {
      revenueToday: revenueToday.rows[0]?.total || 0,
      revenueWeek: revenueWeek.rows[0]?.total || 0,
      revenueMonth: revenueMonth.rows[0]?.total || 0,
      revenueYear: revenueYear.rows[0]?.total || 0,
      escrowBalance: escrowBalance.rows[0]?.total || 0,
      pendingPayouts: pendingPayouts.rows[0]?.total || 0,
      commissionEarned: commissionEarned.rows[0]?.total || 0,
      gatewayFees: gatewayFees.rows[0]?.total || 0,
      refunds: refunds.rows[0]?.total || 0,
      chargebacks: chargebacks.rows[0]?.total || 0,
      avgOrderValue: avgOrderValue.rows[0]?.avg || 0,
      profitByCounty: profitByCounty.rows,
      profitByService: profitByService.rows,
      profitByTier: profitByTier.rows,
    },
  });
}

// ── Commission Campaigns ──────────────────────────────────────

export async function listCampaigns(req, res) {
  const result = await query(
    `SELECT * FROM commission_campaigns ORDER BY created_at DESC LIMIT 50`,
  );
  res.json({ success: true, campaigns: result.rows });
}

export async function createCampaign(req, res) {
  const {
    name, description, fundiTier, county, serviceCategory,
    campaignCommissionPercent, defaultCommissionPercent,
    startsAt, endsAt,
  } = req.body || {};

  if (!name || !campaignCommissionPercent || !startsAt || !endsAt) {
    throw badRequest('Name, commission %, start and end dates are required');
  }

  const result = await query(
    `INSERT INTO commission_campaigns
     (name, description, fundi_tier, county, service_category,
      campaign_commission_percent, default_commission_percent,
      starts_at, ends_at, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
     RETURNING *`,
    [
      name, description || null, fundiTier || null, county || null, serviceCategory || null,
      campaignCommissionPercent, defaultCommissionPercent || 15.00,
      startsAt, endsAt, req.user.id,
    ],
  );

  await auditLog({
    userId: req.user.id,
    action: 'commission_campaign.created',
    entityType: 'commission_campaign',
    entityId: result.rows[0].id,
    metadata: { name, campaignCommissionPercent, startsAt, endsAt },
  });

  res.status(201).json({ success: true, campaign: result.rows[0] });
}

export async function approveCampaign(req, res) {
  const { id } = req.params;
  const result = await query(
    `UPDATE commission_campaigns
     SET status = 'approved', approved_by = $2, approved_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, req.user.id],
  );

  if (!result.rows[0]) throw notFound('Campaign not found or already reviewed');

  await auditLog({
    userId: req.user.id,
    action: 'commission_campaign.approved',
    entityType: 'commission_campaign',
    entityId: id,
    metadata: { name: result.rows[0].name },
  });

  res.json({ success: true, campaign: result.rows[0] });
}

export async function cancelCampaign(req, res) {
  const { id } = req.params;
  const result = await query(
    `UPDATE commission_campaigns
     SET status = 'cancelled', is_active = false
     WHERE id = $1 AND status IN ('pending', 'approved', 'active')
     RETURNING *`,
    [id],
  );

  if (!result.rows[0]) throw notFound('Campaign not found or already ended');

  await auditLog({
    userId: req.user.id,
    action: 'commission_campaign.cancelled',
    entityType: 'commission_campaign',
    entityId: id,
  });

  res.json({ success: true, campaign: result.rows[0] });
}

// ── Financial Access Grants (CEO grants staff access) ─────────
export async function listAccessGrants(req, res) {
  const result = await query(
    `SELECT fag.*, u.full_name as user_name, u.email, u.role
     FROM financial_access_grants fag
     JOIN users u ON u.id = fag.user_id
     ORDER BY fag.granted_at DESC`,
  );
  res.json({ success: true, grants: result.rows });
}

export async function grantFinancialAccess(req, res) {
  const { userId, accessType, expiresAt } = req.body || {};
  if (!userId || !accessType) throw badRequest('userId and accessType are required');

  const result = await query(
    `INSERT INTO financial_access_grants (user_id, access_type, granted_by, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, access_type) DO UPDATE SET is_active = true, expires_at = $4
     RETURNING *`,
    [userId, accessType, req.user.id, expiresAt || null],
  );

  await auditLog({
    userId: req.user.id,
    action: 'financial_access.granted',
    entityType: 'user',
    entityId: userId,
    metadata: { accessType, expiresAt },
  });

  res.json({ success: true, grant: result.rows[0] });
}

export async function revokeFinancialAccess(req, res) {
  const { id } = req.params;
  await query(
    `UPDATE financial_access_grants SET is_active = false WHERE id = $1`,
    [id],
  );

  await auditLog({
    userId: req.user.id,
    action: 'financial_access.revoked',
    entityType: 'financial_access_grant',
    entityId: id,
  });

  res.json({ success: true });
}
