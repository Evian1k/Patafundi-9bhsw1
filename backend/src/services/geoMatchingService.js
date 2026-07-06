/**
 * Geo Matching Service — Uber-style fundi matching with geographic restrictions
 *
 * Features:
 * 1. Smart weighted matching (distance 30%, rating 20%, quality 15%, etc.)
 * 2. Per-service radius rules
 * 3. Fundi travel settings
 * 4. Emergency job expanded search
 * 5. Surge pricing (distance + emergency + night fees)
 * 6. International booking requests
 * 7. Blocked regions enforcement
 * 8. Geo-fencing zones
 * 9. CEO geo controls
 * 10. Overload protection (max concurrent jobs)
 */
import { query } from '../db.js';
import { auditLog } from './auditService.js';

// ============================================================
// SMART MATCHING — Weighted score ranking
// ============================================================

const MATCHING_WEIGHTS = {
  distance: 0.30,
  rating: 0.20,
  quality_score: 0.15,
  acceptance_rate: 0.10,
  completion_rate: 0.10,
  response_time: 0.05,
  verified_status: 0.05,
  recent_activity: 0.05,
};

/**
 * Find and rank fundis near a customer location.
 * This is the CORE matching function — called when a customer creates a job.
 *
 * Returns array of fundis sorted by weighted score (highest first).
 */
export async function findNearbyFundis({
  latitude, longitude, serviceCategory, isEmergency = false, customerId,
}) {
  // Get CEO geo controls
  const controls = await getGeoControls();

  // Get service radius rule
  const serviceRule = await query(
    'select * from service_radius_rules where service_category = $1',
    [serviceCategory],
  );
  const maxServiceRadius = serviceRule.rows[0]?.is_unlimited
    ? 99999
    : (serviceRule.rows[0]?.max_radius_km || controls.max_radius_km);

  // Determine search radius
  let searchRadius = Math.min(maxServiceRadius, controls.max_radius_km);
  if (isEmergency) {
    searchRadius = controls.emergency_radius_km;
  }
  if (controls.disaster_mode) {
    searchRadius = Math.round(searchRadius * controls.disaster_radius_multiplier);
  }

  // Find approved, online fundis with location
  // Using a bounding box for initial filter (faster than haversine on all rows)
  const latRange = searchRadius / 111; // ~111km per degree latitude
  const lngRange = searchRadius / (111 * Math.cos(latitude * Math.PI / 180));

  const candidates = await query(
    `select f.user_id, f.skills, f.rating, f.approval_status, f.online,
            f.latitude, f.longitude, f.location_accuracy,
            f.verification_badge, f.profile_photo_url,
            u.full_name as name, u.role, u.status,
            coalesce(qs.overall_score, 0) as quality_score,
            qs.tier as quality_tier,
            (select count(*)::int from jobs j where j.fundi_id = f.user_id and j.status = 'completed') as completed_jobs,
            (select count(*)::int from jobs j where j.fundi_id = f.user_id and j.status not in ('completed','cancelled','failed')) as active_jobs,
            (select count(*)::int from jobs j where j.fundi_id = f.user_id) as total_jobs,
            coalesce(fts.max_travel_km, 20) as max_travel_km,
            coalesce(fts.emergency_available, false) as emergency_available
     from fundis f
     join users u on u.id = f.user_id
     left join fundi_quality_scores qs on qs.fundi_id = f.user_id
     left join fundi_travel_settings fts on fts.fundi_id = f.user_id
     where f.approval_status = 'approved'
       and u.status = 'active'
       and f.online = true
       and f.latitude is not null
       and f.longitude is not null
       and f.latitude between $1 and $2
       and f.longitude between $3 and $4
       and ($5 = any(f.skills) or $5 = '')
       and f.user_id != $6
     order by f.rating desc nulls last
     limit 50`,
    [
      latitude - latRange, latitude + latRange,
      longitude - lngRange, longitude + lngRange,
      serviceCategory || '', customerId || '00000000-0000-0000-0000-000000000000',
    ],
  );

  // Calculate distance + weighted score for each candidate
  const scored = candidates.rows.map(fundi => {
    const distance = haversineKm(latitude, longitude, Number(fundi.latitude), Number(fundi.longitude));

    // Filter out fundis beyond max radius
    if (distance > searchRadius) return null;

    // Filter out fundis whose travel limit is exceeded
    if (distance > fundi.max_travel_km && !isEmergency) return null;

    // Filter out overloaded fundis
    if (fundi.active_jobs >= 3) return null; // max_concurrent default

    // For emergency, only show emergency-available fundis (or expand search)
    if (isEmergency && !fundi.emergency_available && distance > 20) return null;

    // Calculate weighted score
    const distanceScore = Math.max(0, 100 - (distance / searchRadius) * 100);
    const ratingScore = (fundi.rating || 0) * 20; // 0-5 → 0-100
    const qualityScore = fundi.quality_score || 0;
    const acceptanceRate = fundi.total_jobs > 0 ? (fundi.completed_jobs / fundi.total_jobs) * 100 : 0;
    const completionRate = acceptanceRate; // simplified
    const responseScore = 80; // would need actual response time data
    const verifiedScore = fundi.verification_badge ? 100 : 50;
    const recentActivityScore = fundi.active_jobs > 0 ? 80 : 60;

    const weightedScore =
      distanceScore * MATCHING_WEIGHTS.distance +
      ratingScore * MATCHING_WEIGHTS.rating +
      qualityScore * MATCHING_WEIGHTS.quality_score +
      acceptanceRate * MATCHING_WEIGHTS.acceptance_rate +
      completionRate * MATCHING_WEIGHTS.completion_rate +
      responseScore * MATCHING_WEIGHTS.response_time +
      verifiedScore * MATCHING_WEIGHTS.verified_status +
      recentActivityScore * MATCHING_WEIGHTS.recent_activity;

    return {
      ...fundi,
      distance_km: Math.round(distance * 10) / 10,
      weighted_score: Math.round(weightedScore * 10) / 10,
      scores: {
        distance: Math.round(distanceScore),
        rating: Math.round(ratingScore),
        quality: Math.round(qualityScore),
        acceptance: Math.round(acceptanceRate),
        completion: Math.round(completionRate),
        verified: verifiedScore,
      },
    };
  }).filter(Boolean); // remove nulls

  // Sort by weighted score (highest first)
  scored.sort((a, b) => b.weighted_score - a.weighted_score);

  return scored;
}

// ============================================================
// SURGE PRICING
// ============================================================

/**
 * Calculate surge pricing for a job.
 * Returns { basePrice, travelFee, emergencyFee, nightFee, totalPrice, distanceKm }.
 */
export async function calculateSurgePricing({
  basePrice, distanceKm, isEmergency = false, isNight = false, fundiId,
}) {
  const controls = await getGeoControls();

  const travelFee = Math.round(distanceKm * Number(controls.travel_fee_per_km));
  const emergencyFee = isEmergency ? Number(controls.emergency_fee) : 0;
  const nightFee = isNight ? Number(controls.night_fee) : 0;
  const totalPrice = Number(basePrice) + travelFee + emergencyFee + nightFee;

  return {
    basePrice: Number(basePrice),
    travelFee,
    emergencyFee,
    nightFee,
    totalPrice,
    distanceKm: Math.round(distanceKm * 10) / 10,
    breakdown: {
      service: Number(basePrice),
      travel: travelFee,
      emergency: emergencyFee,
      night: nightFee,
    },
  };
}

// ============================================================
// GEO CONTROLS (CEO settings)
// ============================================================

export async function getGeoControls() {
  const result = await query('select * from geo_controls where id = 1');
  return result.rows[0] || {
    max_radius_km: 100, emergency_radius_km: 80, travel_fee_per_km: 50,
    night_fee: 500, emergency_fee: 1000, international_enabled: false,
    cross_county_enabled: true, cross_country_enabled: false,
    disaster_mode: false, disaster_radius_multiplier: 2.0,
  };
}

export async function updateGeoControls(updates, updatedBy) {
  const current = await getGeoControls();
  const merged = { ...current, ...updates };
  await query(
    `update geo_controls set
      max_radius_km = $1, emergency_radius_km = $2, min_distance_km = $3,
      travel_fee_per_km = $4, night_fee = $5, emergency_fee = $6,
      international_enabled = $7, cross_county_enabled = $8, cross_country_enabled = $9,
      disaster_mode = $10, disaster_radius_multiplier = $11,
      updated_by = $12, updated_at = now()
     where id = 1`,
    [
      merged.max_radius_km, merged.emergency_radius_km, merged.min_distance_km,
      merged.travel_fee_per_km, merged.night_fee, merged.emergency_fee,
      merged.international_enabled, merged.cross_county_enabled, merged.cross_country_enabled,
      merged.disaster_mode, merged.disaster_radius_multiplier, updatedBy,
    ],
  );
  await auditLog({ userId: updatedBy, action: 'geo.controls_updated', entityType: 'geo_controls', metadata: updates });
  return merged;
}

// ============================================================
// BLOCKED REGIONS
// ============================================================

export async function checkBlockedRegion(type, value) {
  const result = await query(
    'select * from blocked_regions where region_type = $1 and region_value = $2',
    [type, value],
  );
  return result.rows[0] || null;
}

export async function addBlockedRegion(type, value, reason, createdBy) {
  const result = await query(
    `insert into blocked_regions (region_type, region_value, reason, created_by)
     values ($1, $2, $3, $4) on conflict (region_type, region_value) do nothing returning *`,
    [type, value, reason, createdBy],
  );
  await auditLog({ userId: createdBy, action: 'geo.region_blocked', entityType: 'blocked_region', metadata: { type, value, reason } });
  return result.rows[0];
}

export async function listBlockedRegions() {
  const result = await query('select * from blocked_regions order by created_at desc');
  return result.rows;
}

export async function removeBlockedRegion(id, removedBy) {
  await query('delete from blocked_regions where id = $1', [id]);
  await auditLog({ userId: removedBy, action: 'geo.region_unblocked', entityType: 'blocked_region', entityId: id });
}

// ============================================================
// SERVICE RADIUS RULES
// ============================================================

export async function getServiceRadiusRules() {
  const result = await query('select * from service_radius_rules order by max_radius_km');
  return result.rows;
}

export async function updateServiceRadiusRule(category, maxRadiusKm, isUnlimited, updatedBy) {
  await query(
    `insert into service_radius_rules (service_category, max_radius_km, is_unlimited)
     values ($1, $2, $3)
     on conflict (service_category) do update set max_radius_km = excluded.max_radius_km, is_unlimited = excluded.is_unlimited, updated_at = now()`,
    [category, maxRadiusKm, isUnlimited],
  );
  await auditLog({ userId: updatedBy, action: 'geo.service_radius_updated', entityType: 'service_radius', metadata: { category, maxRadiusKm, isUnlimited } });
}

// ============================================================
// FUNDI TRAVEL SETTINGS
// ============================================================

export async function getFundiTravelSettings(fundiId) {
  const result = await query('select * from fundi_travel_settings where fundi_id = $1', [fundiId]);
  if (!result.rows[0]) {
    // Create default settings
    await query(
      'insert into fundi_travel_settings (fundi_id) values ($1) on conflict do nothing',
      [fundiId],
    );
    return { fundi_id: fundiId, max_travel_km: 20, willing_to_travel_far: false, travel_fee_per_km: 0, night_rate_multiplier: 1.0, emergency_available: false };
  }
  return result.rows[0];
}

export async function updateFundiTravelSettings(fundiId, settings) {
  const current = await getFundiTravelSettings(fundiId);
  const merged = { ...current, ...settings };
  await query(
    `insert into fundi_travel_settings
      (fundi_id, max_travel_km, willing_to_travel_far, travel_fee_per_km, night_rate_multiplier, emergency_available,
       temporary_location_lat, temporary_location_lng, temporary_location_expires)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (fundi_id) do update set
      max_travel_km = excluded.max_travel_km,
      willing_to_travel_far = excluded.willing_to_travel_far,
      travel_fee_per_km = excluded.travel_fee_per_km,
      night_rate_multiplier = excluded.night_rate_multiplier,
      emergency_available = excluded.emergency_available,
      temporary_location_lat = excluded.temporary_location_lat,
      temporary_location_lng = excluded.temporary_location_lng,
      temporary_location_expires = excluded.temporary_location_expires,
      updated_at = now()`,
    [
      fundiId, merged.max_travel_km, merged.willing_to_travel_far,
      merged.travel_fee_per_km, merged.night_rate_multiplier, merged.emergency_available,
      merged.temporary_location_lat || null, merged.temporary_location_lng || null,
      merged.temporary_location_expires || null,
    ],
  );
  return merged;
}

// ============================================================
// INTERNATIONAL BOOKINGS
// ============================================================

export async function createInternationalBookingRequest(customerId, data) {
  const result = await query(
    `insert into international_bookings
      (customer_id, destination_country, destination_city, destination_address, service_needed, expected_budget, start_date, end_date, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [
      customerId,
      data.destinationCountry || null,
      data.destinationCity || null,
      data.destinationAddress || null,
      data.serviceNeeded || null,
      data.expectedBudget || null,
      data.startDate || null,
      data.endDate || null,
      data.notes || null,
    ],
  );

  // Notify support team (non-blocking — don't fail the booking if notification fails)
  try {
    const supportStaff = await query(
      `select id from users where role in ('super_admin', 'support_agent') and status = 'active'`,
    );
    for (const s of supportStaff.rows) {
      await query(
        `insert into notifications (user_id, type, title, message, data)
         values ($1, 'international_booking', 'International Booking Request',
         $2, $3::jsonb)`,
        [s.id, `Customer requested international service to ${data.destinationCountry || 'unknown'}, ${data.destinationCity || 'unknown'}`,
         JSON.stringify({ bookingId: result.rows[0].id, customerId })],
      );
    }
  } catch (err) {
    console.warn('[geo] international booking notification failed (non-blocking):', err.message);
  }

  return result.rows[0];
}

export async function reviewInternationalBooking(bookingId, status, reviewNotes, reviewedBy) {
  const result = await query(
    `update international_bookings set status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4
     where id = $1 returning *`,
    [bookingId, status, reviewedBy, reviewNotes],
  );
  await auditLog({ userId: reviewedBy, action: 'intl_booking.reviewed', entityType: 'international_booking', entityId: bookingId, metadata: { status, reviewNotes } });
  return result.rows[0];
}

export async function listInternationalBookings(status = null) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'where status = $1'; }
  const result = await query(
    `select ib.*, u.email, u.full_name as customer_name from international_bookings ib
     join users u on u.id = ib.customer_id
     ${where} order by ib.created_at desc`,
    params,
  );
  return result.rows;
}

// ============================================================
// GEO ZONES (Geo-fencing)
// ============================================================

export async function listGeoZones() {
  const result = await query('select * from geo_zones order by zone_type, name');
  return result.rows;
}

export async function createGeoZone(data, createdBy) {
  const result = await query(
    `insert into geo_zones (name, zone_type, country, county, city, center_lat, center_lng, radius_km, is_active, is_blocked)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [data.name, data.zoneType, data.country || 'Kenya', data.county, data.city,
     data.centerLat, data.centerLng, data.radiusKm || 10, data.isActive ?? true, data.isBlocked ?? false],
  );
  await auditLog({ userId: createdBy, action: 'geo.zone_created', entityType: 'geo_zone', entityId: result.rows[0].id, metadata: data });
  return result.rows[0];
}

// ============================================================
// HELPER
// ============================================================

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
