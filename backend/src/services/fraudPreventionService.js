/**
 * Fraud Prevention Service — 7 Production Systems
 *
 * 1. Device Fingerprinting — track + score devices
 * 2. IP Reputation — classify + score IPs
 * 3. Impossible Travel — detect account takeover
 * 4. GPS Spoof Detection — validate fundi locations
 * 5. Blacklist System — block known fraudsters
 * 6. Behavioral Risk Engine — 0-100 risk scoring
 * 7. Chargeback Monitoring — payment fraud detection
 *
 * AI Advisory: All systems feed into AI recommendations.
 * AI NEVER takes action — only recommends. Super Admin decides.
 */
import { query } from '../db.js';
import { auditLog } from './auditService.js';
import crypto from 'node:crypto';

// ============================================================
// 1. DEVICE FINGERPRINTING
// ============================================================

/**
 * Record or update a device fingerprint for a user.
 * Returns the device risk score (0-100).
 */
export async function recordDeviceFingerprint(userId, fingerprint) {
  const {
    deviceId, browserFingerprint, canvasFingerprint, webglFingerprint,
    userAgent, platform, screenSize, timezone, language, installedFonts, ipAddress,
  } = fingerprint;

  // Check if this device is already known
  const existing = await query(
    'select * from device_fingerprints where user_id = $1 and device_id = $2',
    [userId, deviceId],
  );

  // Check if this device is used by OTHER users
  const sharedDevices = await query(
    'select distinct user_id from device_fingerprints where device_id = $1 and user_id != $2',
    [deviceId, userId],
  );

  // Check browser fingerprint matches
  const browserMatches = browserFingerprint ? await query(
    'select distinct user_id from device_fingerprints where browser_fingerprint = $1 and user_id != $2',
    [browserFingerprint, userId],
  ) : { rows: [] };

  // Calculate risk score
  let riskScore = 0;
  const riskFactors = [];

  if (sharedDevices.rows.length > 0) {
    riskScore += 30 * Math.min(sharedDevices.rows.length, 3);
    riskFactors.push(`Device shared with ${sharedDevices.rows.length} other account(s)`);
  }
  if (browserMatches.rows.length > 0) {
    riskScore += 20 * Math.min(browserMatches.rows.length, 3);
    riskFactors.push(`Browser fingerprint matches ${browserMatches.rows.length} other account(s)`);
  }
  if (installedFonts && installedFonts.length > 0 && installedFonts.length < 5) {
    riskScore += 5;
    riskFactors.push('Unusually few fonts (possible headless browser)');
  }
  riskScore = Math.min(riskScore, 100);

  if (existing.rows.length > 0) {
    // Update existing
    await query(
      `update device_fingerprints set
        browser_fingerprint = coalesce($3, browser_fingerprint),
        canvas_fingerprint = coalesce($4, canvas_fingerprint),
        webgl_fingerprint = coalesce($5, webgl_fingerprint),
        user_agent = coalesce($6, user_agent),
        platform = coalesce($7, platform),
        screen_size = coalesce($8, screen_size),
        timezone = coalesce($9, timezone),
        language = coalesce($10, language),
        installed_fonts = coalesce($11, installed_fonts),
        ip_address = coalesce($12, ip_address),
        risk_score = $13,
        last_seen = now(),
        updated_at = now()
       where user_id = $1 and device_id = $2`,
      [userId, deviceId, browserFingerprint, canvasFingerprint, webglFingerprint,
       userAgent, platform, screenSize, timezone, language, installedFonts, ipAddress, riskScore],
    );
  } else {
    // Insert new
    await query(
      `insert into device_fingerprints
        (user_id, device_id, browser_fingerprint, canvas_fingerprint, webgl_fingerprint,
         user_agent, platform, screen_size, timezone, language, installed_fonts, ip_address, risk_score)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [userId, deviceId, browserFingerprint, canvasFingerprint, webglFingerprint,
       userAgent, platform, screenSize, timezone, language, installedFonts, ipAddress, riskScore],
    );
  }

  // Create AI recommendation if high risk
  if (riskScore >= 50) {
    await createFraudRecommendation({
      category: 'device_fingerprint',
      severity: riskScore >= 75 ? 'critical' : 'high',
      title: `High-risk device detected for user ${userId.substring(0, 8)}`,
      description: `Device risk score: ${riskScore}. ${riskFactors.join('. ')}`,
      recommendation: 'Investigate device sharing. Consider requiring additional verification.',
      confidence: riskScore,
      affectedUserId: userId,
    });
  }

  return { riskScore, riskFactors, sharedAccounts: sharedDevices.rows.length };
}

/**
 * Get device history for a user (for fraud analyst investigation).
 */
export async function getDeviceHistory(userId) {
  const result = await query(
    'select * from device_fingerprints where user_id = $1 order by last_seen desc',
    [userId],
  );
  return result.rows;
}

// ============================================================
// 2. IP REPUTATION
// ============================================================

/**
 * Check or create IP reputation record.
 * Uses internal database + heuristics (no external API required).
 * Returns { riskLevel, riskScore, isVpn, isProxy, isTor, isHosting }.
 */
export async function checkIpReputation(ipAddress) {
  if (!ipAddress || ipAddress === 'unknown' || ipAddress === '127.0.0.1') {
    return { riskLevel: 'trusted', riskScore: 0, isVpn: false, isProxy: false, isTor: false, isHosting: false };
  }

  // Check existing record
  const existing = await query('select * from ip_reputation where ip_address = $1', [ipAddress]);

  if (existing.rows[0]) {
    // Update last_seen + total_logins
    await query(
      'update ip_reputation set last_seen = now(), total_logins = total_logins + 1 where ip_address = $1',
      [ipAddress],
    );
    const ip = existing.rows[0];
    const riskScore = calculateIpRiskScore(ip);
    return {
      riskLevel: ip.risk_level,
      riskScore,
      isVpn: ip.is_vpn,
      isProxy: ip.is_proxy,
      isTor: ip.is_tor,
      isHosting: ip.is_hosting,
      country: ip.country,
      fraudReports: ip.fraud_reports,
    };
  }

  // Create new record with heuristic checks
  const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ipAddress);
  const isHosting = isHostingProvider(ipAddress);
  const isTor = isTorExitNode(ipAddress);
  const isVpn = false; // Without external API, can't definitively detect VPN
  const isProxy = false;

  let riskLevel = 'normal';
  if (isPrivate) riskLevel = 'trusted';
  else if (isTor) riskLevel = 'blocked';
  else if (isHosting) riskLevel = 'suspicious';

  const result = await query(
    `insert into ip_reputation (ip_address, is_vpn, is_proxy, is_tor, is_hosting, risk_level)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (ip_address) do update set last_seen = now(), total_logins = ip_reputation.total_logins + 1
     returning *`,
    [ipAddress, isVpn, isProxy, isTor, isHosting, riskLevel],
  );

  const ip = result.rows[0];
  const riskScore = calculateIpRiskScore(ip);

  return {
    riskLevel: ip.risk_level,
    riskScore,
    isVpn: ip.is_vpn,
    isProxy: ip.is_proxy,
    isTor: ip.is_tor,
    isHosting: ip.is_hosting,
    country: ip.country,
    fraudReports: ip.fraud_reports,
  };
}

function calculateIpRiskScore(ip) {
  let score = 0;
  if (ip.is_tor) score += 80;
  if (ip.is_vpn) score += 40;
  if (ip.is_proxy) score += 50;
  if (ip.is_hosting) score += 30;
  score += Math.min(ip.fraud_reports * 15, 60);
  if (ip.risk_level === 'blocked') score = 100;
  if (ip.risk_level === 'high_risk') score = Math.max(score, 75);
  if (ip.risk_level === 'suspicious') score = Math.max(score, 40);
  return Math.min(score, 100);
}

function isHostingProvider(ip) {
  // Heuristic: AWS, GCP, Azure, DigitalOcean ranges
  // This is a simplified check — production should use a proper IP range database
  const hostingRanges = [
    /^3\.\d+\./,  // AWS
    /^13\.\d+\./, // AWS
    /^35\.\d+\./, // GCP
    /^52\.\d+\./, // AWS
    /^104\.(131|236|244)\./, // DigitalOcean
  ];
  return hostingRanges.some(re => re.test(ip));
}

function isTorExitNode(ip) {
  // Without external API, we can't check Tor exit nodes in real-time.
  // Production should integrate with: https://check.torproject.org/exit-addresses
  // For now, return false — external API integration point documented.
  return false;
}

/**
 * Report an IP for fraud (increment fraud_reports).
 */
export async function reportIp(ipAddress, reason) {
  await query(
    `insert into ip_reputation (ip_address, fraud_reports, risk_level)
     values ($1, 1, 'suspicious')
     on conflict (ip_address) do update
     set fraud_reports = ip_reputation.fraud_reports + 1,
         risk_level = case when ip_reputation.fraud_reports + 1 >= 3 then 'high_risk' else 'suspicious' end,
         updated_at = now()`,
    [ipAddress],
  );
}

// ============================================================
// 3. IMPOSSIBLE TRAVEL DETECTION
// ============================================================

/**
 * Record a login event and check for impossible travel.
 * Returns { isImpossibleTravel, distanceKm, timeMinutes, previousLogin }.
 */
export async function recordLoginEvent(userId, ipAddress, deviceInfo = {}) {
  // Get user's previous login
  const previousLogin = await query(
    'select * from login_history where user_id = $1 and success = true order by created_at desc limit 1',
    [userId],
  );

  const prev = previousLogin.rows[0];
  let isImpossibleTravel = false;
  let travelDistanceKm = 0;
  let travelTimeMinutes = 0;

  if (prev) {
    // Calculate time difference
    const prevTime = new Date(prev.created_at);
    const now = new Date();
    const diffMs = now - prevTime;
    travelTimeMinutes = Math.floor(diffMs / 60000);

    // If previous login had location, calculate distance
    if (prev.latitude && prev.longitude && deviceInfo.latitude) {
      travelDistanceKm = haversineKm(
        Number(prev.latitude), Number(prev.longitude),
        Number(deviceInfo.latitude), Number(deviceInfo.longitude),
      );

      // Impossible travel: > 500km in < 60 minutes (avg speed > 500 km/h)
      if (travelDistanceKm > 500 && travelTimeMinutes < 60) {
        isImpossibleTravel = true;
      }
      // Impossible: > 1000km in < 120 minutes
      else if (travelDistanceKm > 1000 && travelTimeMinutes < 120) {
        isImpossibleTravel = true;
      }
    }

    // Check if previous IP is from a different country and time is short
    if (prev.ip_address !== ipAddress && travelTimeMinutes < 30) {
      // Flag for review — different IP in short time
      isImpossibleTravel = true;
    }
  }

  // Insert login record
  const result = await query(
    `insert into login_history
      (user_id, ip_address, country, city, latitude, longitude, device_id, user_agent, success, is_impossible_travel, travel_distance_km, travel_time_minutes, previous_login_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12)
     returning id`,
    [
      userId, ipAddress,
      deviceInfo.country || null, deviceInfo.city || null,
      deviceInfo.latitude || null, deviceInfo.longitude || null,
      deviceInfo.deviceId || null, deviceInfo.userAgent || null,
      isImpossibleTravel, travelDistanceKm, travelTimeMinutes,
      prev?.id || null,
    ],
  );

  // Create AI recommendation if impossible travel detected
  if (isImpossibleTravel) {
    await createFraudRecommendation({
      category: 'impossible_travel',
      severity: 'critical',
      title: `Impossible travel detected for user ${userId.substring(0, 8)}`,
      description: `Travel: ${travelDistanceKm.toFixed(0)}km in ${travelTimeMinutes}min. Previous IP: ${prev?.ip_address || 'unknown'}, Current IP: ${ipAddress}`,
      recommendation: 'Possible account takeover. Consider forcing re-verification or temporarily locking the account.',
      confidence: 90,
      affectedUserId: userId,
    });
  }

  return { isImpossibleTravel, travelDistanceKm, travelTimeMinutes, previousLoginId: prev?.id };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// 4. GPS SPOOF DETECTION
// ============================================================

/**
 * Validate a fundi's GPS location.
 * Returns { isSpoofed, riskScore, indicators }.
 */
export async function validateGpsLocation(fundiId, { latitude, longitude, accuracy, speedKmh, jobId }) {
  const indicators = [];
  let riskScore = 0;

  // Check 1: Accuracy too good (fake GPS apps report < 5m accuracy)
  if (accuracy !== null && accuracy !== undefined && accuracy < 5) {
    indicators.push('Suspiciously perfect GPS accuracy (< 5m) — possible GPS spoofing app');
    riskScore += 30;
  }

  // Check 2: Accuracy too poor (might be network-only location, not real GPS)
  if (accuracy !== null && accuracy > 500) {
    indicators.push('Very poor GPS accuracy (> 500m) — location may not be reliable');
    riskScore += 10;
  }

  // Check 3: Impossible speed
  if (speedKmh !== null && speedKmh > 300) {
    indicators.push(`Impossible speed: ${speedKmh} km/h`);
    riskScore += 40;
  }

  // Check 4: Compare to previous location (teleportation check)
  const prevLocation = await query(
    'select latitude, longitude, created_at from gps_validations where fundi_id = $1 order by created_at desc limit 1',
    [fundiId],
  );

  if (prevLocation.rows[0]) {
    const prev = prevLocation.rows[0];
    const distance = haversineKm(Number(prev.latitude), Number(prev.longitude), latitude, longitude);
    const timeDiffMin = (Date.now() - new Date(prev.created_at).getTime()) / 60000;

    if (timeDiffMin > 0) {
      const calculatedSpeed = distance / (timeDiffMin / 60); // km/h
      if (calculatedSpeed > 300 && distance > 50) {
        indicators.push(`Teleportation detected: ${distance.toFixed(0)}km in ${timeDiffMin.toFixed(0)}min (${calculatedSpeed.toFixed(0)} km/h)`);
        riskScore += 50;
      }
    }
  }

  // Check 5: Same exact coordinates repeated (static mock location)
  if (prevLocation.rows[0]) {
    const prev = prevLocation.rows[0];
    if (Number(prev.latitude) === latitude && Number(prev.longitude) === longitude) {
      const count = await query(
        'select count(*)::int as n from gps_validations where fundi_id = $1 and latitude = $2 and longitude = $3',
        [fundiId, latitude, longitude],
      );
      if (count.rows[0].n > 5) {
        indicators.push(`Same exact GPS coordinates repeated ${count.rows[0].n} times — possible static mock location`);
        riskScore += 25;
      }
    }
  }

  riskScore = Math.min(riskScore, 100);
  const isSpoofed = riskScore >= 50;

  // Save validation record
  await query(
    `insert into gps_validations (fundi_id, job_id, latitude, longitude, accuracy, speed_kmh, is_spoofed, spoof_indicators, risk_score)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [fundiId, jobId || null, latitude, longitude, accuracy, speedKmh, isSpoofed, indicators, riskScore],
  );

  // Create AI recommendation if spoofed
  if (isSpoofed) {
    await createFraudRecommendation({
      category: 'gps_spoofing',
      severity: riskScore >= 75 ? 'critical' : 'high',
      title: `GPS spoofing detected for fundi ${fundiId.substring(0, 8)}`,
      description: `GPS risk score: ${riskScore}. Indicators: ${indicators.join('; ')}`,
      recommendation: 'Investigate fundi location. Consider suspending GPS-based features until verified.',
      confidence: riskScore,
      affectedUserId: fundiId,
    });
  }

  return { isSpoofed, riskScore, indicators };
}

// ============================================================
// 5. BLACKLIST SYSTEM
// ============================================================

/**
 * Check if a value is blacklisted.
 * Returns { isBlacklisted, reason, details } or null.
 */
export async function checkBlacklist(type, value) {
  if (!type || !value) return null;
  const result = await query(
    `select * from blacklists
     where blacklist_type = $1 and value = $2
       and (is_permanent = true or expires_at is null or expires_at > now())`,
    [type, value],
  );
  if (!result.rows[0]) return null;
  return {
    isBlacklisted: true,
    reason: result.rows[0].reason,
    details: result.rows[0].details,
    isPermanent: result.rows[0].is_permanent,
  };
}

/**
 * Check multiple values against blacklist at once.
 */
export async function checkBlacklistBatch(items) {
  const results = {};
  for (const { type, value } of items) {
    const hit = await checkBlacklist(type, value);
    if (hit) results[`${type}:${value}`] = hit;
  }
  return results;
}

/**
 * Add a blacklist entry (super_admin only).
 */
export async function addToBlacklist(type, value, reason, details, isPermanent, expiresAt, createdBy) {
  const result = await query(
    `insert into blacklists (blacklist_type, value, reason, details, is_permanent, expires_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (blacklist_type, value) do update
     set reason = excluded.reason, details = excluded.details, is_permanent = excluded.is_permanent, expires_at = excluded.expires_at
     returning *`,
    [type, value, reason, details || null, isPermanent || false, expiresAt || null, createdBy],
  );

  await auditLog({
    userId: createdBy,
    action: 'blacklist.add',
    entityType: 'blacklist',
    entityId: result.rows[0].id,
    metadata: { type, value, reason, isPermanent },
  });

  return result.rows[0];
}

/**
 * Remove a blacklist entry (super_admin only).
 */
export async function removeFromBlacklist(type, value, removedBy) {
  const result = await query(
    'delete from blacklists where blacklist_type = $1 and value = $2 returning id',
    [type, value],
  );
  if (result.rows[0]) {
    await auditLog({
      userId: removedBy,
      action: 'blacklist.remove',
      entityType: 'blacklist',
      entityId: result.rows[0].id,
      metadata: { type, value },
    });
  }
  return { removed: result.rowCount > 0 };
}

/**
 * List blacklist entries (with optional filter).
 */
export async function listBlacklist(type = null, limit = 100) {
  const params = [];
  let where = '';
  if (type) {
    params.push(type);
    where = 'where blacklist_type = $1';
  }
  params.push(limit);
  const result = await query(
    `select b.*, u.full_name as created_by_name from blacklists b
     join users u on u.id = b.created_by
     ${where} order by b.created_at desc limit $${params.length}`,
    params,
  );
  return result.rows;
}

// ============================================================
// 6. BEHAVIORAL RISK ENGINE
// ============================================================

/**
 * Calculate behavioral risk score for a user.
 * Score: 0 (safe) to 100 (critical risk).
 * Returns { riskScore, riskLevel, factors }.
 */
export async function calculateBehavioralRisk(userId) {
  // Gather user activity data
  const [
    loginData, paymentData, referralData, reviewData, jobData, messageData, userData, trustData,
  ] = await Promise.all([
    query('select count(*)::int as n from login_history where user_id = $1 and created_at > now() - interval \'30 days\'', [userId]),
    query('select count(*)::int as n from payments where user_id = $1 and created_at > now() - interval \'30 days\'', [userId]).catch(() => ({ rows: [{ n: 0 }] })),
    query('select count(*)::int as n from referrals where referrer_id = $1 and created_at > now() - interval \'30 days\'', [userId]).catch(() => ({ rows: [{ n: 0 }] })),
    query('select count(*)::int as n, avg(rating)::numeric as avg_rating from reviews where reviewer_id = $1 and created_at > now() - interval \'30 days\'', [userId]).catch(() => ({ rows: [{ n: 0, avg_rating: 0 }] })),
    query(`select
             count(*)::int as total,
             count(*) filter (where status = 'cancelled')::int as cancelled,
             count(*) filter (where status = 'completed')::int as completed
           from jobs where customer_id = $1 or fundi_id = $1`, [userId]).catch(() => ({ rows: [{ total: 0, cancelled: 0, completed: 0 }] })),
    query(`select count(*)::int as n from chat_messages where sender_id = $1 and created_at > now() - interval '1 hour'`, [userId]).catch(() => ({ rows: [{ n: 0 }] })),
    query('select created_at, status, role from users where id = $1', [userId]),
    query('select score from trust_scores where user_id = $1', [userId]).catch(() => ({ rows: [{ score: 100 }] })),
  ]);

  const loginFreq = loginData.rows[0]?.n || 0;
  const paymentFreq = paymentData.rows[0]?.n || 0;
  const referralActivity = referralData.rows[0]?.n || 0;
  const reviewCount = reviewData.rows[0]?.n || 0;
  const avgRating = Number(reviewData.rows[0]?.avg_rating || 0);
  const totalJobs = jobData.rows[0]?.total || 0;
  const cancelledJobs = jobData.rows[0]?.cancelled || 0;
  const completedJobs = jobData.rows[0]?.completed || 0;
  const messagesLastHour = messageData.rows[0]?.n || 0;
  const accountAgeDays = userData.rows[0]?.created_at
    ? Math.floor((Date.now() - new Date(userData.rows[0].created_at).getTime()) / 86400000)
    : 0;
  const trustScore = trustData.rows[0]?.score || 100;

  const cancellationRate = totalJobs > 0 ? (cancelledJobs / totalJobs) * 100 : 0;
  const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
  const acceptanceRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  // Calculate risk factors
  let riskScore = 0;
  const factors = {};

  // High login frequency (possible credential stuffing)
  if (loginFreq > 50) { riskScore += 15; factors.high_login_frequency = loginFreq; }
  else if (loginFreq > 30) { riskScore += 8; factors.elevated_login_frequency = loginFreq; }

  // High payment frequency (possible money laundering)
  if (paymentFreq > 100) { riskScore += 20; factors.high_payment_frequency = paymentFreq; }
  else if (paymentFreq > 50) { riskScore += 10; factors.elevated_payment_frequency = paymentFreq; }

  // High referral activity (possible referral abuse)
  if (referralActivity > 20) { riskScore += 25; factors.high_referral_activity = referralActivity; }
  else if (referralActivity > 10) { riskScore += 12; factors.elevated_referral_activity = referralActivity; }

  // Review anomaly (all 5-star or all 1-star reviews)
  if (reviewCount >= 5 && (avgRating === 5 || avgRating === 1)) {
    riskScore += 20; factors.review_anomaly = `All ${avgRating}-star reviews`;
  }

  // High cancellation rate
  if (cancellationRate > 50 && totalJobs > 5) { riskScore += 20; factors.high_cancellation_rate = `${cancellationRate.toFixed(1)}%`; }

  // Message spam (many messages in short time)
  if (messagesLastHour > 50) { riskScore += 15; factors.message_spam = messagesLastHour; }

  // New account with high activity
  if (accountAgeDays < 7 && (paymentFreq > 10 || referralActivity > 5)) {
    riskScore += 20; factors.new_account_high_activity = `${accountAgeDays} days old`;
  }

  // Low trust score
  if (trustScore < 50) { riskScore += 15; factors.low_trust_score = trustScore; }

  riskScore = Math.min(riskScore, 100);

  const riskLevel = riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

  // Upsert behavioral risk score
  await query(
    `insert into behavioral_risk_scores
      (user_id, risk_score, risk_level, login_frequency_30d, payment_frequency_30d,
       referral_activity_30d, review_anomaly_score, job_cancellation_rate, message_spam_score,
       account_age_days, completion_rate, acceptance_rate, trust_score, factors, last_recalculated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
     on conflict (user_id) do update set
       risk_score = excluded.risk_score, risk_level = excluded.risk_level,
       login_frequency_30d = excluded.login_frequency_30d,
       payment_frequency_30d = excluded.payment_frequency_30d,
       referral_activity_30d = excluded.referral_activity_30d,
       review_anomaly_score = excluded.review_anomaly_score,
       job_cancellation_rate = excluded.job_cancellation_rate,
       message_spam_score = excluded.message_spam_score,
       account_age_days = excluded.account_age_days,
       completion_rate = excluded.completion_rate,
       acceptance_rate = excluded.acceptance_rate,
       trust_score = excluded.trust_score,
       factors = excluded.factors,
       last_recalculated_at = now(),
       updated_at = now()`,
    [
      userId, riskScore, riskLevel, loginFreq, paymentFreq, referralActivity,
      reviewCount, cancellationRate, messagesLastHour, accountAgeDays,
      completionRate, acceptanceRate, trustScore, JSON.stringify(factors),
    ],
  );

  // Create AI recommendation if high risk
  if (riskScore >= 50) {
    await createFraudRecommendation({
      category: 'behavioral_anomaly',
      severity: riskScore >= 75 ? 'critical' : 'high',
      title: `High behavioral risk for user ${userId.substring(0, 8)}`,
      description: `Risk score: ${riskScore} (${riskLevel}). Factors: ${JSON.stringify(factors)}`,
      recommendation: 'Review user activity. Consider additional verification or temporary restrictions.',
      confidence: riskScore,
      affectedUserId: userId,
    });
  }

  return { riskScore, riskLevel, factors };
}

/**
 * Get behavioral risk for a user.
 */
export async function getBehavioralRisk(userId) {
  const result = await query('select * from behavioral_risk_scores where user_id = $1', [userId]);
  if (!result.rows[0]) {
    // Calculate on demand if not exists
    return calculateBehavioralRisk(userId);
  }
  return result.rows[0];
}

// ============================================================
// 7. CHARGEBACK & PAYMENT FRAUD MONITORING
// ============================================================

/**
 * Record a payment fraud event.
 */
export async function recordPaymentFraud({ userId, paymentId, jobId, mpesaNumber, fraudType, amount, severity, evidence }) {
  const result = await query(
    `insert into payment_fraud_monitoring
      (user_id, payment_id, job_id, mpesa_number, fraud_type, amount, severity, evidence)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning *`,
    [userId, paymentId || null, jobId || null, mpesaNumber || null, fraudType, amount || null, severity || 'medium', JSON.stringify(evidence || {})],
  );

  await createFraudRecommendation({
    category: 'payment_fraud',
    severity: severity === 'critical' ? 'critical' : 'high',
    title: `Payment fraud detected: ${fraudType} for user ${userId.substring(0, 8)}`,
    description: `Fraud type: ${fraudType}, Amount: ${amount || 'N/A'}, Severity: ${severity}`,
    recommendation: 'Investigate payment. Consider freezing escrow and wallet.',
    confidence: 80,
    affectedUserId: userId,
  });

  return result.rows[0];
}

/**
 * Check for payment fraud patterns.
 * Called when a payment event occurs.
 */
export async function checkPaymentFraudPatterns(userId, mpesaNumber) {
  const patterns = [];

  // Check 1: Multiple chargebacks in 30 days
  const chargebacks = await query(
    `select count(*)::int as n from payment_fraud_monitoring
     where user_id = $1 and fraud_type = 'chargeback' and detected_at > now() - interval '30 days'`,
    [userId],
  );
  if (chargebacks.rows[0].n >= 2) {
    patterns.push({ type: 'repeated_chargebacks', count: chargebacks.rows[0].n, severity: 'high' });
  }

  // Check 2: Same M-Pesa number used by multiple accounts
  if (mpesaNumber) {
    const mpesaAccounts = await query(
      `select distinct user_id from payment_fraud_monitoring
       where mpesa_number = $1 and user_id != $2`,
      [mpesaNumber, userId],
    );
    if (mpesaAccounts.rows.length > 0) {
      patterns.push({ type: 'shared_mpesa_number', count: mpesaAccounts.rows.length, severity: 'medium' });
    }

    // Check 3: High-risk M-Pesa number (previously flagged)
    const highRiskMpesa = await query(
      `select count(*)::int as n from payment_fraud_monitoring
       where mpesa_number = $1 and status = 'confirmed'`,
      [mpesaNumber],
    );
    if (highRiskMpesa.rows[0].n > 0) {
      patterns.push({ type: 'high_risk_mpesa', count: highRiskMpesa.rows[0].n, severity: 'critical' });
    }
  }

  // Check 4: Multiple failed payments in 24 hours
  const failedPayments = await query(
    `select count(*)::int as n from payments
     where user_id = $1 and status = 'failed' and created_at > now() - interval '24 hours'`,
    [userId],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  if (failedPayments.rows[0].n >= 5) {
    patterns.push({ type: 'failed_payment_spree', count: failedPayments.rows[0].n, severity: 'medium' });
  }

  // Check 5: Multiple disputed transactions
  const disputes = await query(
    `select count(*)::int as n from disputes
     where customer_id = $1 and created_at > now() - interval '30 days'`,
    [userId],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  if (disputes.rows[0].n >= 3) {
    patterns.push({ type: 'frequent_disputes', count: disputes.rows[0].n, severity: 'high' });
  }

  // Record detected patterns
  for (const pattern of patterns) {
    await recordPaymentFraud({
      userId,
      mpesaNumber,
      fraudType: pattern.type,
      severity: pattern.severity,
      evidence: { count: pattern.count, detectedAt: new Date().toISOString() },
    });
  }

  return patterns;
}

// ============================================================
// HELPER: Create AI Recommendation
// ============================================================

async function createFraudRecommendation({ category, severity, title, description, recommendation, confidence, affectedUserId }) {
  try {
    await query(
      `insert into ai_recommendations
        (category, severity, title, description, recommendation, confidence, affected_user_id, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [category, severity, title, description, recommendation, confidence, affectedUserId],
    );
  } catch (err) {
    // Don't let AI recommendation failure break the main flow
    console.warn('[fraudPrevention] could not create AI recommendation:', err.message);
  }
}

// ============================================================
// DASHBOARD: Get fraud prevention overview
// ============================================================

export async function getFraudPreventionOverview() {
  const [
    deviceStats, ipStats, travelStats, gpsStats, blacklistStats,
    behavioralStats, paymentFraudStats,
  ] = await Promise.all([
    query('select count(*)::int as total, count(*) filter (where risk_score > 0)::int as at_risk, count(*) filter (where risk_score >= 50)::int as high_risk from device_fingerprints'),
    query('select risk_level, count(*)::int as n from ip_reputation group by risk_level'),
    query('select count(*)::int as total, count(*) filter (where is_impossible_travel)::int as flagged from login_history'),
    query('select count(*)::int as total, count(*) filter (where is_spoofed)::int as spoofed from gps_validations'),
    query('select blacklist_type, count(*)::int as n from blacklists group by blacklist_type'),
    query('select risk_level, count(*)::int as n from behavioral_risk_scores group by risk_level'),
    query('select fraud_type, count(*)::int as n, count(*) filter (where status = ' + "'confirmed'" + ')::int as confirmed from payment_fraud_monitoring group by fraud_type'),
  ]);

  return {
    devices: deviceStats.rows[0],
    ipReputation: ipStats.rows,
    impossibleTravel: travelStats.rows[0],
    gpsSpoofing: gpsStats.rows[0],
    blacklists: blacklistStats.rows,
    behavioralRisk: behavioralStats.rows,
    paymentFraud: paymentFraudStats.rows,
  };
}
