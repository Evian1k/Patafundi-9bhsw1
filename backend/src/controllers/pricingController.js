/**
 * Pricing Controller — exposes the pricing engine to the frontend.
 *
 * Endpoints:
 *   POST /api/pricing/calculate  — get a price quote (auth required)
 *   GET  /api/pricing/services   — list all service base prices (public)
 *   GET  /api/pricing/config     — get multipliers (admin only)
 *   PUT  /api/pricing/services/:category — update base price (admin only)
 *   PUT  /api/pricing/config     — update multipliers (admin only)
 *   GET  /api/pricing/recommendations    — AI recommendations (admin only)
 *   POST /api/pricing/recommendations/:id/review — approve/reject (admin only)
 *   POST  /api/pricing/recommendations/generate — trigger AI analysis (admin only)
 */

import { query } from '../db.js';
import { calculateJobPrice, logPriceCalculation, generatePricingRecommendations } from '../services/pricingEngineService.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

// ── Calculate price quote ─────────────────────────────────────
export async function calculatePrice(req, res) {
  const {
    serviceCategory,
    latitude,
    longitude,
    county,
    isEmergency = false,
    isImmediate = false,
    complexity = 'simple',
    weatherCondition = null,
    scheduledFor = null,
    fundiId = null,
  } = req.body || {};

  if (!serviceCategory) throw badRequest('Service category is required');

  // If fundiId is provided, calculate distance from fundi to customer
  let distanceKm = 0;
  if (fundiId && latitude && longitude) {
    const fundiResult = await query(
      'SELECT latitude, longitude FROM fundis WHERE user_id = $1',
      [fundiId],
    );
    if (fundiResult.rows[0]?.latitude && fundiResult.rows[0]?.longitude) {
      const fLat = Number(fundiResult.rows[0].latitude);
      const fLng = Number(fundiResult.rows[0].longitude);
      // Haversine formula
      const toRad = (v) => (v * Math.PI) / 180;
      const dLat = toRad(latitude - fLat);
      const dLng = toRad(longitude - fLng);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(fLat)) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2;
      distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      // Note: this is straight-line. Road routing would use Google Maps
      // Directions API — for now, multiply by 1.3 to approximate road distance.
      distanceKm = distanceKm * 1.3;
    }
  }

  // Get fundi tier if fundiId provided
  let fundiTier = 'bronze';
  if (fundiId) {
    const tierResult = await query(
      'SELECT tier FROM fundis WHERE user_id = $1',
      [fundiId],
    );
    fundiTier = tierResult.rows[0]?.tier || 'bronze';
  }

  const price = await calculateJobPrice({
    serviceCategory,
    distanceKm,
    county,
    isEmergency,
    isImmediate,
    complexity,
    weatherCondition,
    scheduledFor,
    fundiTier,
    userId: req.user?.id,
  });

  // Log the calculation for audit + AI learning
  const calcId = await logPriceCalculation(null, req.user?.id || null, serviceCategory, price);

  res.json({
    success: true,
    calculationId: calcId,
    price,
  });
}

// ── List all service base prices (public) ─────────────────────
export async function listServicePrices(_req, res) {
  const result = await query(
    `SELECT service_category, service_label, base_price, minimum_price, maximum_price,
            estimated_duration_minutes, is_active
     FROM service_pricing WHERE is_active = true ORDER BY service_label`,
  );
  res.json({ success: true, services: result.rows });
}

// ── Get pricing multipliers (admin only) ──────────────────────
export async function getPricingConfig(_req, res) {
  const result = await query('SELECT * FROM pricing_multipliers ORDER BY updated_at DESC LIMIT 1');
  const counties = await query('SELECT * FROM county_pricing_overrides WHERE is_active = true ORDER BY county');
  const events = await query(
    `SELECT * FROM pricing_events WHERE is_active = true AND ends_at > now() ORDER BY starts_at`,
  );
  res.json({
    success: true,
    config: result.rows[0],
    countyOverrides: counties.rows,
    activeEvents: events.rows,
  });
}

// ── Update service base price (admin only) ────────────────────
export async function updateServicePrice(req, res) {
  const { category } = req.params;
  const {
    basePrice,
    minimumPrice,
    maximumPrice,
    simpleMultiplier,
    mediumMultiplier,
    complexMultiplier,
    expertMultiplier,
    commissionPercent,
    estimatedDurationMinutes,
  } = req.body || {};

  const result = await query(
    `UPDATE service_pricing SET
       base_price = COALESCE($2, base_price),
       minimum_price = COALESCE($3, minimum_price),
       maximum_price = COALESCE($4, maximum_price),
       simple_multiplier = COALESCE($5, simple_multiplier),
       medium_multiplier = COALESCE($6, medium_multiplier),
       complex_multiplier = COALESCE($7, complex_multiplier),
       expert_multiplier = COALESCE($8, expert_multiplier),
       commission_percent = COALESCE($9, commission_percent),
       estimated_duration_minutes = COALESCE($10, estimated_duration_minutes),
       updated_by = $11,
       updated_at = now()
     WHERE service_category = $12
     RETURNING *`,
    [
      null, basePrice, minimumPrice, maximumPrice,
      simpleMultiplier, mediumMultiplier, complexMultiplier, expertMultiplier,
      commissionPercent, estimatedDurationMinutes,
      req.user.id, category,
    ],
  );

  if (!result.rows[0]) throw notFound('Service category not found');

  await auditLog({
    userId: req.user.id,
    action: 'pricing.service_updated',
    entityType: 'service_pricing',
    entityId: result.rows[0].id,
    metadata: { category, ...req.body },
  });

  res.json({ success: true, service: result.rows[0] });
}

// ── Update global multipliers (admin only) ────────────────────
export async function updatePricingConfig(req, res) {
  const fields = [
    'night_multiplier', 'weekend_multiplier', 'holiday_multiplier', 'rush_hour_multiplier',
    'emergency_multiplier', 'immediate_multiplier',
    'rain_light_multiplier', 'rain_heavy_multiplier', 'storm_multiplier',
    'surge_low_multiplier', 'surge_medium_multiplier', 'surge_high_multiplier',
    'distance_free_km', 'distance_rate_tier1', 'distance_rate_tier2', 'distance_rate_tier3',
    'distance_max_km', 'platform_fee',
    'fundi_tier_bronze_commission', 'fundi_tier_silver_commission',
    'fundi_tier_gold_commission', 'fundi_tier_platinum_commission',
  ];

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      setClauses.push(`${field} = $${paramIdx}`);
      values.push(req.body[field]);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) {
    throw badRequest('No valid fields to update');
  }

  setClauses.push(`updated_by = $${paramIdx}`);
  values.push(req.user.id);
  paramIdx++;
  setClauses.push(`updated_at = now()`);

  const result = await query(
    `UPDATE pricing_multipliers SET ${setClauses.join(', ')}
     WHERE id = (SELECT id FROM pricing_multipliers ORDER BY updated_at DESC LIMIT 1)
     RETURNING *`,
    values,
  );

  await auditLog({
    userId: req.user.id,
    action: 'pricing.config_updated',
    entityType: 'pricing_multipliers',
    entityId: result.rows[0]?.id,
    metadata: req.body,
  });

  res.json({ success: true, config: result.rows[0] });
}

// ── AI Recommendations ────────────────────────────────────────
export async function listRecommendations(_req, res) {
  const result = await query(
    `SELECT * FROM ai_pricing_recommendations
     WHERE status = 'pending'
     ORDER BY confidence DESC, created_at DESC
     LIMIT 50`,
  );
  res.json({ success: true, recommendations: result.rows });
}

export async function generateRecommendations(req, res) {
  const recommendations = await generatePricingRecommendations();
  await auditLog({
    userId: req.user.id,
    action: 'pricing.ai_recommendations_generated',
    entityType: 'ai_pricing_recommendations',
    entityId: null,
    metadata: { count: recommendations.length },
  });
  res.json({ success: true, generated: recommendations.length, recommendations });
}

export async function reviewRecommendation(req, res) {
  const { id } = req.params;
  const { status } = req.body || {}; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    throw badRequest('Status must be approved or rejected');
  }

  const result = await query(
    `UPDATE ai_pricing_recommendations
     SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, status, req.user.id],
  );

  if (!result.rows[0]) throw notFound('Recommendation not found or already reviewed');

  // If approved, apply the price change
  if (status === 'approved' && result.rows[0].service_category) {
    const rec = result.rows[0];
    await query(
      `UPDATE service_pricing SET base_price = $2, updated_by = $3, updated_at = now()
       WHERE service_category = $1`,
      [rec.service_category, rec.suggested_price, req.user.id],
    );
  }

  await auditLog({
    userId: req.user.id,
    action: `pricing.recommendation_${status}`,
    entityType: 'ai_pricing_recommendations',
    entityId: id,
    metadata: { category: result.rows[0].service_category, suggestedPrice: result.rows[0].suggested_price },
  });

  res.json({ success: true, recommendation: result.rows[0] });
}
