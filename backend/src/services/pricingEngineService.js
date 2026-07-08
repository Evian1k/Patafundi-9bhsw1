/**
 * Pricing Engine Service — platform-calculated pricing (Uber-style).
 *
 * Customers never set their own price. The platform calculates a fair price
 * using: base price + distance + time + weather + demand + complexity +
 * emergency + county adjustments + event surges.
 *
 * Every calculation is logged to price_calculations for audit + AI learning.
 *
 * AI can RECOMMEND price adjustments (stored in ai_pricing_recommendations)
 * but NEVER applies them automatically — CEO must approve.
 */

import { query } from '../db.js';

// ── Cache pricing config (refreshed every 5 min) ──────────────
let configCache = null;
let configCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getPricingConfig() {
  const now = Date.now();
  if (configCache && now - configCacheTime < CACHE_TTL_MS) {
    return configCache;
  }
  const result = await query('SELECT * FROM pricing_multipliers ORDER BY updated_at DESC LIMIT 1');
  configCache = result.rows[0] || {};
  configCacheTime = now;
  return configCache;
}

async function getServicePricing(serviceCategory) {
  const result = await query(
    'SELECT * FROM service_pricing WHERE service_category = $1 AND is_active = true',
    [serviceCategory],
  );
  return result.rows[0];
}

async function getCountyAdjustment(county, serviceCategory) {
  if (!county) return 0;
  const result = await query(
    `SELECT price_adjustment_percent FROM county_pricing_overrides
     WHERE county = $1 AND service_category = $2 AND is_active = true`,
    [county, serviceCategory],
  );
  return result.rows[0]?.price_adjustment_percent || 0;
}

async function getActiveEventMultiplier(county) {
  const result = await query(
    `SELECT multiplier FROM pricing_events
     WHERE is_active = true
       AND now() BETWEEN starts_at AND ends_at
       AND (county IS NULL OR county = $1)
     ORDER BY multiplier DESC LIMIT 1`,
    [county || null],
  );
  return result.rows[0]?.multiplier || 1.0;
}

// ── Demand vs Supply calculation ──────────────────────────────
async function getDemandMultiplier(county) {
  // Count pending jobs (matching status) vs online fundis
  const demandResult = await query(
    `SELECT COUNT(*)::int as count FROM jobs
     WHERE status = 'matching'
       AND created_at > now() - interval '15 minutes'`,
    [],
  );
  const supplyResult = await query(
    `SELECT COUNT(*)::int as count FROM fundis
     WHERE approval_status = 'approved' AND is_online = true`,
    [],
  );

  const pendingJobs = demandResult.rows[0]?.count || 0;
  const onlineFundis = supplyResult.rows[0]?.count || 1;
  const ratio = pendingJobs / Math.max(onlineFundis, 1);

  const config = await getPricingConfig();
  if (ratio >= 2.0) return config.surge_high_multiplier || 1.25;
  if (ratio >= 1.5) return config.surge_medium_multiplier || 1.10;
  if (ratio >= 1.0) return config.surge_low_multiplier || 1.05;
  return 1.00;
}

// ── Time-based multiplier ─────────────────────────────────────
function getTimeMultiplier(date = new Date()) {
  // Note: Kenya is UTC+3 (EAT). We use local hour for simplicity.
  // In production, would use a timezone library.
  const hour = date.getHours();
  const day = date.getDay(); // 0=Sun, 6=Sat

  let multiplier = 1.00;
  let reasons = [];

  // Night: 8PM - 6AM
  if (hour >= 20 || hour < 6) {
    multiplier *= 1.10; // +10%
    reasons.push('night');
  }

  // Weekend
  if (day === 0 || day === 6) {
    multiplier *= 1.05; // +5%
    reasons.push('weekend');
  }

  // Rush hour: 7-9AM, 5-7PM
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) {
    multiplier *= 1.05; // +5%
    reasons.push('rush_hour');
  }

  return { multiplier, reasons };
}

// ── Weather multiplier (stub — integrate OpenWeatherMap later) ─
function getWeatherMultiplier(weatherCondition) {
  if (!weatherCondition) return { multiplier: 1.00, reason: null };
  const cond = weatherCondition.toLowerCase();
  if (cond.includes('storm') || cond.includes('thunder')) {
    return { multiplier: 1.15, reason: 'storm' };
  }
  if (cond.includes('heavy rain') || cond.includes('downpour')) {
    return { multiplier: 1.10, reason: 'heavy_rain' };
  }
  if (cond.includes('rain') || cond.includes('drizzle')) {
    return { multiplier: 1.05, reason: 'light_rain' };
  }
  return { multiplier: 1.00, reason: null };
}

// ── Distance fee calculation ──────────────────────────────────
function calculateDistanceFee(distanceKm, config) {
  if (distanceKm <= 0) return 0;
  const freeKm = config.distance_free_km || 3.0;
  if (distanceKm <= freeKm) return 0;

  const chargeableKm = distanceKm - freeKm;
  let fee = 0;

  if (chargeableKm <= 7) {
    // 3-10km tier
    fee = chargeableKm * (config.distance_rate_tier1 || 50);
  } else if (chargeableKm <= 17) {
    // 10-20km tier
    fee = 7 * (config.distance_rate_tier1 || 50) + (chargeableKm - 7) * (config.distance_rate_tier2 || 75);
  } else {
    // 20km+ tier
    fee = 7 * (config.distance_rate_tier1 || 50)
        + 10 * (config.distance_rate_tier2 || 75)
        + (chargeableKm - 17) * (config.distance_rate_tier3 || 120);
  }

  return Math.round(fee);
}

// ── MAIN: Calculate price for a job ───────────────────────────
export async function calculateJobPrice(params) {
  const {
    serviceCategory,
    distanceKm = 0,
    county,
    isEmergency = false,
    isImmediate = false,
    complexity = 'simple',
    weatherCondition = null,
    scheduledFor,
    fundiTier = 'bronze',
    userId,
  } = params;

  const [service, config, countyAdj, eventMult, demandMult] = await Promise.all([
    getServicePricing(serviceCategory),
    getPricingConfig(),
    getCountyAdjustment(county || '', serviceCategory),
    getActiveEventMultiplier(county || ''),
    getDemandMultiplier(county || ''),
  ]);

  if (!service) {
    throw new Error(`No pricing configured for service: ${serviceCategory}`);
  }

  // 1. Base price
  let basePrice = Number(service.base_price);

  // 2. Complexity multiplier
  const complexityKey = `${complexity}_multiplier`;
  const complexityMult = Number(service[complexityKey]) || 1.0;
  basePrice = basePrice * complexityMult;

  // 3. County adjustment (percentage)
  basePrice = basePrice * (1 + countyAdj / 100);

  // 4. Distance fee
  const travelFee = calculateDistanceFee(distanceKm, config);

  // 5. Time multiplier
  const scheduleDate = scheduledFor ? new Date(scheduledFor) : new Date();
  const timeData = getTimeMultiplier(scheduleDate);

  // 6. Emergency fee
  let emergencyFee = 0;
  if (isEmergency) {
    emergencyFee = basePrice * (config.emergency_multiplier - 1);
  }
  if (isImmediate) {
    emergencyFee = basePrice * (config.immediate_multiplier - 1);
  }

  // 7. Weather multiplier
  const weatherData = getWeatherMultiplier(weatherCondition);

  // 8. Surge multiplier (demand + events)
  const surgeMultiplier = Math.max(demandMult, eventMult);

  // ── Calculate final price ─────────────────────────────────
  const subtotal = basePrice + travelFee + emergencyFee;
  const finalBeforeFees = subtotal * timeData.multiplier * weatherData.multiplier * surgeMultiplier;

  // Platform fee
  const platformFee = Number(config.platform_fee) || 0;

  // Final price (clamped to min/max)
  let finalPrice = finalBeforeFees + platformFee;
  const minPrice = Number(service.minimum_price);
  const maxPrice = Number(service.maximum_price);
  finalPrice = Math.max(minPrice, Math.min(maxPrice, finalPrice));
  finalPrice = Math.round(finalPrice);

  // ── Commission + fundi earnings ───────────────────────────
  const commissionKey = `fundi_tier_${fundiTier}_commission`;
  const commissionPercent = Number(config[commissionKey]) || Number(service.commission_percent) || 15;
  const commissionAmount = Math.round((finalPrice * commissionPercent) / 100);
  const fundiEarnings = finalPrice - commissionAmount - platformFee;

  // ── Estimated duration ────────────────────────────────────
  const estimatedDuration = Number(service.estimated_duration_minutes) || 60;

  // ── ETA (estimated time of arrival) ───────────────────────
  // Rough: 2 min/km in city traffic, min 5 min
  const etaMinutes = Math.max(5, Math.round(distanceKm * 2));

  const breakdown = {
    serviceCost: Math.round(basePrice),
    travelFee: Math.round(travelFee),
    emergencyFee: Math.round(emergencyFee),
    timeMultiplier: timeData.multiplier,
    weatherMultiplier: weatherData.multiplier,
    surgeMultiplier,
    platformFee: Math.round(platformFee),
    estimatedDurationMinutes: estimatedDuration,
    etaMinutes,
    total: finalPrice,
    commissionPercent,
    commissionAmount,
    fundiEarnings: Math.max(0, fundiEarnings),
    distanceKm: Math.round(distanceKm * 10) / 10,
    factors: {
      complexity,
      countyAdjustment: countyAdj,
      timeReasons: timeData.reasons,
      weatherReason: weatherData.reason,
      demandMultiplier: demandMult,
      eventMultiplier: eventMult,
      isEmergency,
      isImmediate,
    },
  };

  return breakdown;
}

// ── Log a price calculation (for audit + AI learning) ─────────
export async function logPriceCalculation(
  jobId,
  userId,
  serviceCategory,
  price,
) {
  const result = await query(
    `INSERT INTO price_calculations
     (job_id, user_id, service_category, base_price, distance_km, travel_fee,
      time_multiplier, emergency_fee, weather_multiplier, surge_multiplier,
      complexity_multiplier, county_adjustment_percent, platform_fee,
      estimated_duration_minutes, final_price, commission_percent,
      commission_amount, fundi_earnings, factors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      jobId, userId, serviceCategory,
      price.serviceCost, price.distanceKm, price.travelFee,
      price.timeMultiplier, price.emergencyFee, price.weatherMultiplier,
      price.surgeMultiplier, 1.0, price.factors.countyAdjustment || 0,
      price.platformFee, price.estimatedDurationMinutes, price.total,
      price.commissionPercent, price.commissionAmount, price.fundiEarnings,
      JSON.stringify(price.factors),
    ],
  );
  return result.rows[0]?.id;
}

// ── AI Recommendation (read-only — CEO must approve) ──────────
export async function generatePricingRecommendations() {
  // Analyze completed jobs to find pricing anomalies
  const result = await query(
    `SELECT service_category,
            AVG(final_price) as avg_price,
            COUNT(*) as job_count,
            AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))/60)::numeric(10,1) as avg_completion_min
     FROM jobs
     WHERE status = 'completed'
       AND completed_at > now() - interval '30 days'
     GROUP BY service_category
     HAVING COUNT(*) > 5`,
  );

  const recommendations = [];
  for (const row of result.rows) {
    const service = await getServicePricing(row.service_category);
    if (!service) continue;

    const avgAccepted = Number(row.avg_price);
    const basePrice = Number(service.base_price);

    // If customers consistently accept prices 20%+ above base, recommend increasing base
    if (avgAccepted > basePrice * 1.20 && row.job_count > 10) {
      const suggestedPrice = Math.round(basePrice * 1.05);
      recommendations.push({
        serviceCategory: row.service_category,
        recommendationType: 'increase',
        currentPrice: basePrice,
        suggestedPrice,
        adjustmentPercent: 5.0,
        reason: `Average accepted price (KES ${avgAccepted}) is 20%+ above base (KES ${basePrice}). Demand suggests price can increase.`,
        confidence: 0.75,
        dataBasis: { avgAccepted, basePrice, jobCount: row.job_count, avgCompletionMin: row.avg_completion_min },
      });
    }

    // If cancellation rate is high for a category, price may be too high
    if (avgAccepted < basePrice * 0.85 && row.job_count > 10) {
      const suggestedPrice = Math.round(basePrice * 0.95);
      recommendations.push({
        serviceCategory: row.service_category,
        recommendationType: 'decrease',
        currentPrice: basePrice,
        suggestedPrice,
        adjustmentPercent: -5.0,
        reason: `Average accepted price (KES ${avgAccepted}) is 15%+ below base (KES ${basePrice}). Price may be too high, causing cancellations.`,
        confidence: 0.65,
        dataBasis: { avgAccepted, basePrice, jobCount: row.job_count },
      });
    }
  }

  // Insert recommendations as pending
  for (const rec of recommendations) {
    await query(
      `INSERT INTO ai_pricing_recommendations
       (service_category, recommendation_type, current_price, suggested_price,
        adjustment_percent, reason, confidence, data_basis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        rec.serviceCategory, rec.recommendationType, rec.currentPrice,
        rec.suggestedPrice, rec.adjustmentPercent, rec.reason,
        rec.confidence, JSON.stringify(rec.dataBasis),
      ],
    );
  }

  return recommendations;
}
