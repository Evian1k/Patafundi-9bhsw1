import { query, transaction } from '../db.js';
import { badRequest, forbidden } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { getSignedAccessUrl, getSignedThumbUrl } from '../services/storageService.js';
import { createFundiRegistration } from '../services/fundiRegistrationService.js';
import { auditLog } from '../services/auditService.js';
import { buildFundiApprovalStatus } from '../services/fundiApprovalStatusService.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function registerFundi(req, res) {
  if (req.user.role === 'fundi_pending' || req.user.role === 'customer') {
    const result = await createFundiRegistration({
      body: req.body,
      files: req.files,
      existingUserId: req.user.id,
    });
    await auditLog({ userId: req.user.id, action: 'fundi.register', entityType: 'fundi', entityId: result.fundi.id });
    return res.status(201).json({ success: true, fundi: result.fundi, verification: result.verification });
  }
  throw badRequest('Already registered as a fundi');
}

export async function onboardingStatus(req, res) {
  const [user, fundi] = await Promise.all([
    query('select id, email, role, email_verified_at from users where id = $1', [req.user.id]),
    query('select approval_status, rejection_reason, verification_review_status from fundis where user_id = $1', [req.user.id]),
  ]);
  const approvalStatus = fundi.rows[0]?.approval_status || 'not_registered';
  res.json({
    success: true,
    onboarding: {
      role: user.rows[0]?.role,
      emailVerified: Boolean(user.rows[0]?.email_verified_at),
      approvalStatus,
      rejectionReason: fundi.rows[0]?.rejection_reason || null,
      reviewStatus: fundi.rows[0]?.verification_review_status || null,
      message: approvalStatus === 'approved'
        ? 'Approved — you can go online and accept jobs.'
        : approvalStatus === 'rejected'
          ? 'Your application was rejected. Contact support or re-register.'
          : 'Your account is under review.',
    },
  });
}

export async function profile(req, res) {
  const result = await query('select * from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, fundi: result.rows[0] || null });
}

export async function approvalStatus(req, res) {
  const result = await query('select approval_status, rejection_reason from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, ...buildFundiApprovalStatus(result.rows[0]) });
}

export async function updateProfile(req, res) {
  const result = await query(
    `update fundis set bio = coalesce($2, bio), skills = coalesce($3, skills), updated_at = now()
     where user_id = $1 returning *`,
    [req.user.id, req.body?.bio || null, req.body?.skills || null],
  );
  res.json({ success: true, fundi: result.rows[0] });
}

function publicFundiShape(row, photoUrls = {}) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    name: row.name || row.full_name,
    skills: row.skills || [],
    rating: row.rating == null ? null : Number(row.rating),
    trustScore: row.trust_score,
    trust_score: row.trust_score,
    approvalStatus: row.approval_status,
    profilePhotoUrl: photoUrls.profilePhotoUrl || null,
    profile_photo_url: photoUrls.profilePhotoUrl || null,
    verified: Boolean(row.verification_badge) || row.approval_status === 'approved',
    verificationBadge: Boolean(row.verification_badge),
    // Pro subscription visibility (spec §24): paying subscribers are flagged
    // publicly and sort first in search; verification/eligibility rules above
    // are never overridden by payment status.
    pro: Boolean(row.pro_active),
    proActive: Boolean(row.pro_active),
    // Public profile depth (spec §15): about, experience, track record.
    bio: row.bio || null,
    experience: row.experience || null,
    completedJobs: Number(row.completed_jobs || 0),
    completed_jobs: Number(row.completed_jobs || 0),
    reviewCount: Number(row.review_count || 0),
    review_count: Number(row.review_count || 0),
  };
}

async function resolveProfilePhotoUrls(row) {
  if (!row?.profile_photo_url || row.approval_status !== 'approved') return {};
  return {
    profilePhotoUrl: await getSignedThumbUrl(row.profile_photo_thumb_url, row.profile_photo_url),
  };
}

export async function publicFundi(req, res) {
  const result = await query(
    `select f.id, f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score, f.approval_status,
            f.profile_photo_url, f.profile_photo_thumb_url, f.verification_badge,
            f.bio, f.experience,
            (select count(*)::int from jobs j where j.fundi_id = f.user_id and j.status = 'completed') as completed_jobs,
            (select count(*)::int from reviews r join jobs j2 on j2.id = r.job_id where j2.fundi_id = f.user_id) as review_count
     from fundis f join users u on u.id = f.user_id where f.id = $1 or f.user_id = $1`,
    [req.params.id],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ success: false, error: 'Fundi not found' });
  const photoUrls = await resolveProfilePhotoUrls(row);
  res.json({ success: true, fundi: publicFundiShape(row, photoUrls) });
}

export async function searchFundis(req, res) {
  const latitude = req.query.latitude == null ? null : Number(req.query.latitude);
  const longitude = req.query.longitude == null ? null : Number(req.query.longitude);
  const skill = req.query.skill ? String(req.query.skill).toLowerCase() : null;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 25)));

  // SECURITY: every visibility filter is enforced server-side.
  //   users.role = 'fundi'           → excludes fundi_pending, customer, admin
  //   users.status = 'active'        → excludes disabled/banned users
  //   f.approval_status = 'approved' → excludes pending/rejected/suspended
  //   f.online = true                → excludes offline fundis
  //   f.latitude IS NOT NULL         → excludes fundis without a location
  // No frontend filter can bypass this — the SQL is the source of truth.
  const result = await query(
    `select f.id, f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
      f.latitude, f.longitude, f.location_accuracy,
      f.profile_photo_url, f.profile_photo_thumb_url, f.verification_badge,
      f.updated_at as last_active,
      (select count(*) from jobs j where j.fundi_id = f.user_id and j.status = 'completed')::int as completed_jobs,
      coalesce(qs.overall_score, 0) as quality_score,
      qs.tier as quality_tier,
      (select 1 from subscriptions s
        where s.fundi_id = f.user_id and s.status = 'active' and s.expires_at > now()
        order by s.expires_at desc limit 1) as pro_active
     from fundis f
     join users u on u.id = f.user_id
     left join fundi_quality_scores qs on qs.fundi_id = f.id
     where u.role = 'fundi'
       and u.status = 'active'
       and f.approval_status = 'approved'
       and f.online = true
       and f.latitude is not null
       and f.longitude is not null
     order by pro_active desc nulls last, f.rating desc nulls last, f.trust_score desc nulls last
     limit $1`,
    [limit],
  );

  const fundis = await Promise.all(result.rows
    .filter((row) => !skill || row.skills?.map((s) => String(s).toLowerCase()).includes(skill))
    .map(async (row) => {
      const distanceKm = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? haversineKm(latitude, longitude, Number(row.latitude), Number(row.longitude))
        : null;
      const photoUrls = await resolveProfilePhotoUrls(row);
      return {
        ...publicFundiShape(row, photoUrls),
        distanceKm,
        completedJobs: row.completed_jobs || 0,
        qualityScore: Number(row.quality_score || 0),
        qualityTier: row.quality_tier || null,
        lastActive: row.last_active,
      };
    }));

  // Ranking formula (Phase 4: Smart Fundi Ranking):
  // 1. Distance (closest first)
  // 2. Quality score (if available — from fundi_quality_scores table)
  // 3. Rating
  // 4. Trust score
  // 5. Completion rate (completedJobs)
  fundis.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (Number(b.qualityScore || 0) !== Number(a.qualityScore || 0)) {
      return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
    }
    if (Number(b.rating || 0) !== Number(a.rating || 0)) {
      return Number(b.rating || 0) - Number(a.rating || 0);
    }
    if (Number(b.trustScore || 0) !== Number(a.trustScore || 0)) {
      return Number(b.trustScore || 0) - Number(a.trustScore || 0);
    }
    return Number(b.completedJobs || 0) - Number(a.completedJobs || 0);
  });

  res.json({ success: true, fundis });
}

export async function dashboard(req, res) {
  const [jobs, fundi, wallet, ratings, offers, earnings] = await Promise.all([
    query(`select * from jobs where fundi_id = $1 order by updated_at desc limit 10`, [req.user.id]),
    query(`select * from fundis where user_id = $1`, [req.user.id]),
    query(
      `select coalesce(sum(case when status in ('requested','processing','completed') then amount else 0 end),0) as balance
       from payouts where fundi_id = $1`,
      [req.user.id],
    ),
    query(
      `select coalesce(avg(r.rating),0) as average, count(*)::int as total
       from reviews r join jobs j on j.id = r.job_id where j.fundi_id = $1`,
      [req.user.id],
    ),
    // Real pending-offer count (migration 038) — offers made in the last
    // 15 minutes that this fundi has not responded to yet.
    query(
      `select count(*)::int as n from fundi_job_offers
       where fundi_id = $1 and response = 'pending' and offered_at > now() - interval '15 minutes'`,
      [req.user.id],
    ),
    // Real earnings from released escrow (never hardcoded — spec §58).
    query(
      `select
         coalesce(sum(case when et.created_at >= date_trunc('day', now()) then et.amount else 0 end), 0) as today,
         coalesce(sum(case when et.created_at >= now() - interval '7 days' then et.amount else 0 end), 0) as week,
         coalesce(sum(case when et.created_at >= now() - interval '30 days' then et.amount else 0 end), 0) as month
       from escrow_transactions et
       join jobs j on j.id = et.job_id
       where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'`,
      [req.user.id],
    ),
  ]);
  const profile = fundi.rows[0] || null;
  // Real profile completion from actual profile fields (spec §58: no fake 85%).
  const completionFields = profile
    ? [
        Array.isArray(profile.skills) && profile.skills.length > 0,
        Boolean(profile.experience && profile.experience.trim()),
        Boolean(profile.bio && profile.bio.trim()),
        Boolean(profile.mpesa_number),
        profile.latitude != null && profile.longitude != null,
      ]
    : [];
  const profileCompletion = completionFields.length
    ? Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)
    : 0;
  const earningsRow = earnings.rows[0] || {};
  res.json({
    success: true,
    dashboard: {
      jobs: jobs.rows,
      fundi: profile,
      verificationStatus: profile?.approval_status || 'not_registered',
      profileCompletion,
      online: Boolean(profile?.online),
      walletBalance: Number(wallet.rows[0]?.balance || 0),
      jobStats: {
        newRequests: Number(offers.rows[0]?.n || 0),
        activeJobs: jobs.rows.filter((job) => !['completed', 'cancelled', 'failed'].includes(job.status)).length,
        completedJobs: jobs.rows.filter((job) => job.status === 'completed').length,
      },
      ratings: {
        average: Number(ratings.rows[0]?.average || 0),
        total: Number(ratings.rows[0]?.total || 0),
      },
      // Earnings in both shapes: flat keys (mobile DashboardScreen) and the
      // nested today/week/month object (web + mobile EarningsScreen).
      earnings: {
        today: Number(earningsRow.today || 0),
        week: Number(earningsRow.week || 0),
        month: Number(earningsRow.month || 0),
      },
      earningsToday: Number(earningsRow.today || 0),
      earningsWeek: Number(earningsRow.week || 0),
      earningsMonth: Number(earningsRow.month || 0),
    },
  });
}

export async function status(req, res) {
  const result = await query(
    `select f.online, f.latitude, f.longitude, f.location_accuracy, f.approval_status,
            f.subscription_active, f.subscription_expires_at, f.premium_plan,
            case
              when f.subscription_expires_at > now() then true
              else false
            end as subscription_active_calc,
            case
              when f.subscription_expires_at > now() then extract(day from f.subscription_expires_at - now())::int
              else 0
            end as days_left
     from fundis f where f.user_id = $1`,
    [req.user.id],
  );
  const row = result.rows[0] || { online: false };
  res.json({
    success: true,
    status: {
      online: row.online,
      latitude: row.latitude,
      longitude: row.longitude,
      location_accuracy: row.location_accuracy,
      approval_status: row.approval_status,
      subscriptionActive: row.subscription_active_calc || false,
      daysLeft: row.days_left || 0,
      premiumPlan: row.premium_plan || null,
    },
  });
}

async function requireApprovedFundi(userId, role) {
  if (role === 'admin') return;
  const result = await query('select approval_status from fundis where user_id = $1', [userId]);
  if (!result.rows[0] || result.rows[0].approval_status !== 'approved') {
    const { logAccessDecision } = await import('../middleware/accessDebug.js');
    await logAccessDecision({ user: { id: userId, role } }, 'fundiController.requireApprovedFundi:denied', {
      approvalStatus: result.rows[0]?.approval_status ?? 'not_registered',
    });
    throw forbidden('Only approved fundis can perform this action');
  }
}

export async function goOnline(req, res) {
  await requireApprovedFundi(req.user.id, req.user.role);
  const { latitude, longitude, accuracy = null } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Latitude and longitude are required');
  await query(
    `update fundis set online = true, latitude = $2, longitude = $3, location_accuracy = $4, updated_at = now()
     where user_id = $1`,
    [req.user.id, latitude, longitude, accuracy],
  );
  res.json({ success: true });
}

export async function goOffline(req, res) {
  await query(`update fundis set online = false, updated_at = now() where user_id = $1`, [req.user.id]);
  res.json({ success: true });
}

export async function location(req, res) {
  await requireApprovedFundi(req.user.id, req.user.role);
  const { latitude, longitude, accuracy = null, jobId = null } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Latitude and longitude are required');

  // ── Fraud Prevention: GPS Spoof Detection ────────────────────
  // Non-blocking — logs the validation but doesn't stop location update
  try {
    const { validateGpsLocation } = await import('../services/fraudPreventionService.js');
    await validateGpsLocation(req.user.id, { latitude, longitude, accuracy, jobId });
  } catch (err) {
    console.warn('[fraudPrevention] GPS validation failed (non-blocking):', err.message);
  }

  const active = await transaction(async (client) => {
    await client.query(
      `update fundis set online = true, latitude = $2, longitude = $3, location_accuracy = $4, updated_at = now()
       where user_id = $1`,
      [req.user.id, latitude, longitude, accuracy],
    );
    const job = await client.query(
      `select * from jobs
       where ($2::uuid is null or id = $2)
         and fundi_id = $1
         and status not in ('completed', 'cancelled', 'failed')
       order by updated_at desc limit 1`,
      [req.user.id, jobId],
    );
    if (job.rows[0]) {
      await client.query(
        `insert into gps_history (job_id, fundi_id, latitude, longitude, accuracy)
         values ($1, $2, $3, $4, $5)`,
        [job.rows[0].id, req.user.id, latitude, longitude, accuracy],
      );
      await client.query(
        `update jobs set fundi_latitude = $2, fundi_longitude = $3, updated_at = now()
         where id = $1`,
        [job.rows[0].id, latitude, longitude],
      );
    }
    return job.rows[0] || null;
  });
  const payload = { jobId: active?.id || jobId || null, fundiId: req.user.id, latitude, longitude, accuracy, recordedAt: new Date().toISOString() };
  if (payload.jobId) emitEvent('fundi:location:update', payload, `job:${payload.jobId}`);
  emitEvent('fundi:location:update', payload, `user:${req.user.id}`);
  res.json({ success: true, location: payload });
}

export async function walletTransactions(req, res) {
  const result = await query(
    `select * from payouts where fundi_id = $1 order by created_at desc limit $2 offset $3`,
    [req.user.id, Number(req.query.limit || 20), Number(req.query.offset || 0)],
  );
  res.json({ success: true, transactions: result.rows });
}

export async function ratings(req, res) {
  const limit = Number(req.query.limit || 10);
  const offset = Number(req.query.offset || 0);
  const fundiId = req.params.id || req.user?.id;

  if (fundiId) {
    const result = await query(
      `select r.* from reviews r join jobs j on j.id = r.job_id where j.fundi_id = $1 order by r.created_at desc limit $2 offset $3`,
      [fundiId, limit, offset],
    );
    return res.json({ success: true, ratings: result.rows });
  }

  const result = await query(
    `select r.rating, r.comment, u.full_name as "customerName", r.created_at
     from reviews r
     join users u on u.id = r.reviewer_id
     order by r.created_at desc
     limit $1 offset $2`,
    [limit, offset],
  );
  res.json({ success: true, ratings: result.rows });
}
