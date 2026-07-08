/**
 * Financial Confidentiality Service
 *
 * Enforces the rule that ONLY the CEO (super_admin) and explicitly authorized
 * roles can see internal financial data (revenue, commission, profit, margins).
 *
 * Customers see only: final price.
 * Fundis see only: their net earnings.
 * Staff see only: what they need for their job (no financial data).
 * CEO sees: everything.
 */

import { query } from '../db.js';

/**
 * Check if a user has a specific financial access type.
 * super_admin/admin always return true. Other roles need explicit grants.
 */
export async function hasFinancialAccess(userId, accessType) {
  if (!userId) return false;
  try {
    const result = await query(
      'SELECT can_view_financial($1, $2) as allowed',
      [userId, accessType],
    );
    return result.rows[0]?.allowed === true;
  } catch {
    // If the function doesn't exist (migration not run yet), deny by default
    return false;
  }
}

/**
 * Middleware factory: requires a specific financial access type.
 * If the user lacks access, returns 403 with a generic message.
 *
 * Usage:
 *   router.get('/admin/revenue',
 *     authRequired,
 *     requireFinancialAccess('view_revenue'),
 *     handler
 *   );
 */
export function requireFinancialAccess(accessType) {
  return async (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const allowed = await hasFinancialAccess(req.user.id, accessType);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this financial information.',
      });
    }
    next();
  };
}

/**
 * Strip financial fields from a job object before sending to a customer.
 * Customers should NEVER see: commission, platform fee, fundi earnings, etc.
 */
export function sanitizeJobForCustomer(job) {
  if (!job) return job;
  const {
    // Strip all internal financial fields
    platform_price, price_calculation_id,
    commission_amount, commission_percent,
    platform_fee, fundi_earnings,
    final_price,  // customer sees estimated_price only (which IS the final price)
    // Keep only customer-facing fields
    ...customerJob
  } = job;
  return customerJob;
}

/**
 * Strip financial fields from a job object before sending to a fundi.
 * Fundis should see ONLY their net earnings — NOT commission %, platform fee, etc.
 * The fundi sees: service, location, duration, distance, their earnings.
 */
export function sanitizeJobForFundi(job) {
  if (!job) return job;
  // Calculate net earnings (85% of estimated price as default, or use stored value)
  const estimatedPrice = Number(job.estimated_price || job.estimatedPrice || 0);
  const netEarnings = job.fundi_earnings
    ? Number(job.fundi_earnings)
    : Math.round(estimatedPrice * 0.85); // default 15% commission

  return {
    id: job.id,
    serviceCategory: job.service_category || job.serviceCategory,
    description: job.description,
    status: job.status,
    urgency: job.urgency,
    customerAddress: job.customer_address,
    customerLatitude: job.customer_latitude,
    customerLongitude: job.customer_longitude,
    customerName: job.customer_name,
    estimatedDurationMinutes: job.estimated_duration_minutes,
    distanceKm: job.distance_km,
    // The ONLY financial field the fundi sees
    netEarnings,
    createdAt: job.created_at,
    acceptedAt: job.accepted_at,
  };
}

/**
 * Get the active commission campaign for a fundi (if any).
 * Returns the reduced commission % or null if no active campaign.
 */
export async function getActiveCampaign(fundiId, serviceCategory, county) {
  const result = await query(
    `SELECT campaign_commission_percent, name as campaign_name
     FROM commission_campaigns
     WHERE status = 'approved'
       AND is_active = true
       AND now() BETWEEN starts_at AND ends_at
       AND (fundi_tier IS NULL OR fundi_tier = (
         SELECT tier FROM fundis WHERE user_id = $1
       ))
       AND (county IS NULL OR county = $3)
       AND (service_category IS NULL OR service_category = $2)
     ORDER BY campaign_commission_percent ASC
     LIMIT 1`,
    [fundiId, serviceCategory || null, county || null],
  );
  return result.rows[0] || null;
}

/**
 * Record a revenue ledger entry (CEO-only data).
 * Called internally when payments are processed — never exposed to customers/fundis.
 */
export async function recordRevenueEntry(entry) {
  await query(
    `INSERT INTO revenue_ledger
     (job_id, transaction_type, amount, currency,
      customer_paid, commission_amount, platform_fee_amount,
      fundi_payout, gateway_fee_amount, net_revenue,
      payment_method, gateway_reference, user_id, fundi_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      entry.jobId || null,
      entry.transactionType,
      entry.amount,
      entry.currency || 'KES',
      entry.customerPaid || null,
      entry.commissionAmount || null,
      entry.platformFeeAmount || null,
      entry.fundiPayout || null,
      entry.gatewayFeeAmount || null,
      entry.netRevenue || null,
      entry.paymentMethod || null,
      entry.gatewayReference || null,
      entry.userId || null,
      entry.fundiId || null,
      entry.notes || null,
    ],
  );
}
