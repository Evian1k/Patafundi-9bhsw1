import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound, parseUuid } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { logNonFatal } from '../utils/logError.js';
import { recordTimelineEvent, recordJobStatusTimeline } from '../services/timelineService.js';
import { transitionJob, assertTransitionAllowed, JOB_TRANSITIONS, ACTIVE_JOB_STATES, COMPLETED_JOB_STATES, STATUS_LABELS } from '../services/jobStateMachine.js';
import { createQuote, decideQuote as decideQuoteEntity, getLiveQuoteForJob, addQuoteQuestion } from '../services/quoteService.js';
import {
  createExpectedCommission,
  markCommissionCustomerConfirmed,
  rewardTrust,
  scanContent,
  verifyJobCompletionOtp,
} from '../services/fraudService.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestFundis(latitude, longitude, skill, limit = 5) {
  // SECURITY: same visibility filters as searchFundis — enforced server-side.
  //   u.role = 'fundi' + u.status = 'active' + f.approval_status = 'approved' + f.online = true
  // A disabled/banned/pending fundi can NEVER receive a job match.
  const baseWhere = `u.role = 'fundi' and u.status = 'active' and f.approval_status = 'approved' and f.online = true`;

  // Fallback used when the customer has no coordinates OR no geo candidates:
  // return globally top-rated matching fundis (distance unknown, not fake).
  const topRatedFallback = async () => {
    const fallback = await query(
      `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score
       from fundis f join users u on u.id = f.user_id
       where ${baseWhere} ${skill ? `and $2 = any(f.skills)` : ''}
       order by f.rating desc nulls last, f.trust_score desc nulls last limit $1`,
      skill ? [limit, String(skill)] : [limit],
    );
    return fallback.rows.map((row) => ({ ...row, distanceKm: null }));
  };

  if (latitude == null || longitude == null) {
    return topRatedFallback();
  }
  const result = await query(
    `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
            f.latitude, f.longitude
     from fundis f join users u on u.id = f.user_id
     where ${baseWhere}
       and f.latitude is not null and f.longitude is not null`,
  );
  const geoMatches = result.rows
    .map((row) => ({
      ...row,
      distanceKm: haversineKm(latitude, longitude, Number(row.latitude), Number(row.longitude)),
    }))
    .filter((row) => {
      if (!skill) return true;
      const needle = String(skill).toLowerCase();
      return (row.skills || []).some((s) => String(s).toLowerCase() === needle);
    })
    .sort((a, b) => {
      // Distance first, then rating, then trust score.
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
      return Number(b.trust_score || 0) - Number(a.trust_score || 0);
    })
    .slice(0, limit);
  if (geoMatches.length) return geoMatches;
  // No fundi has coordinates (or none matched the skill geo-wise) — degrade
  // gracefully to the top-rated fallback instead of silently matching nobody.
  return topRatedFallback();
}

async function canAccessJob(user, job) {
  if (!user) return false;
  if (user.isAdmin || user.role === 'admin' || user.role === 'super_admin' || job.customer_id === user.id || job.fundi_id === user.id) return true;
  // Company workflow: assigned technician + members of the owning company
  if (job.technician_user_id && job.technician_user_id === user.id) return true;
  if (job.company_id) {
    const { getMembership } = await import('../middleware/companyAccess.js');
    const membership = await getMembership(job.company_id, user.id);
    return Boolean(membership && membership.status === 'active');
  }
  return false;
}

async function requireJobAccess(user, job) {
  if (!(await canAccessJob(user, job))) throw forbidden('Not allowed to access this job');
}

function requireAssignedFundi(user, job) {
  if (user.isAdmin || user.role === 'super_admin') return;
  if (job.fundi_id !== user.id) throw forbidden('Only the assigned fundi can update this job');
}

function requireCustomer(user, job) {
  if (user.isAdmin || user.role === 'super_admin') return;
  if (job.customer_id !== user.id) throw forbidden('Only the customer can perform this action');
}

async function loadJob(jobId) {
  const id = parseUuid(jobId, 'job id');
  const result = await query('select * from jobs where id = $1', [id]);
  if (!result.rows[0]) throw notFound('Job not found');
  return result.rows[0];
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    jobId: job.id,
    customerId: job.customer_id,
    fundiId: job.fundi_id,
    serviceCategory: job.service_category,
    service_category: job.service_category,
    description: job.description,
    locationName: job.location_name,
    location_name: job.location_name,
    location: job.location_name,
    customerLatitude: job.customer_latitude == null ? undefined : Number(job.customer_latitude),
    customerLongitude: job.customer_longitude == null ? undefined : Number(job.customer_longitude),
    customer_latitude: job.customer_latitude == null ? undefined : Number(job.customer_latitude),
    customer_longitude: job.customer_longitude == null ? undefined : Number(job.customer_longitude),
    fundiLatitude: job.fundi_latitude == null ? undefined : Number(job.fundi_latitude),
    fundiLongitude: job.fundi_longitude == null ? undefined : Number(job.fundi_longitude),
    fundi_latitude: job.fundi_latitude == null ? undefined : Number(job.fundi_latitude),
    fundi_longitude: job.fundi_longitude == null ? undefined : Number(job.fundi_longitude),
    latitude: job.customer_latitude == null ? undefined : Number(job.customer_latitude),
    longitude: job.customer_longitude == null ? undefined : Number(job.customer_longitude),
    status: job.status,
    urgency: job.urgency,
    paymentStatus: job.payment_status,
    escrowStatus: job.escrow_status,
    customerCompletionConfirmed: Boolean(job.customer_completion_confirmed),
    customer_completion_confirmed: Boolean(job.customer_completion_confirmed),
    estimatedPrice: job.estimated_price == null ? undefined : Number(job.estimated_price),
    estimated_price: job.estimated_price == null ? undefined : Number(job.estimated_price),
    finalPrice: job.final_price == null ? undefined : Number(job.final_price),
    final_price: job.final_price == null ? undefined : Number(job.final_price),
    title: job.title || `${job.service_category || 'Service'} job`,
    category: job.service_category,
    bookingNumber: job.booking_number,
    booking_number: job.booking_number,
    statusLabel: STATUS_LABELS[job.status] || job.status,
    providerType: job.provider_type || 'fundi',
    provider_type: job.provider_type || 'fundi',
    companyId: job.company_id,
    company_id: job.company_id,
    technicianUserId: job.technician_user_id,
    technician_user_id: job.technician_user_id,
    scheduledAt: job.scheduled_at,
    scheduled_at: job.scheduled_at,
    propertyId: job.property_id,
    property_id: job.property_id,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    updated_at: job.updated_at,
  };
}

/**
 * Provider-facing job view (spec §24 privacy): before a provider is ACCEPTED,
 * they must not see the customer's exact address or precise coordinates.
 * We keep an area-level name and ~1km-rounded coordinates so distance and
 * neighbourhood context remain usable for the accept/reject decision.
 */
function coarseCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100) / 100; // ≈1.1km grid
}

function areaOnlyName(name) {
  if (!name) return name;
  const parts = String(name).split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  return parts.slice(-2).join(', '); // drop street-level detail, keep area + city
}

function providerJobView(job) {
  const pub = publicJob(job);
  const revealed = Boolean(job.fundi_id) || job.status === 'accepted' || job.status === 'assigned';
  if (revealed) return pub;
  const coarse = {
    ...pub,
    locationName: areaOnlyName(job.location_name),
    location_name: areaOnlyName(job.location_name),
    location: areaOnlyName(job.location_name),
  };
  for (const key of ['customerLatitude', 'customer_latitude', 'customerLongitude', 'customer_longitude', 'latitude', 'longitude']) {
    coarse[key] = coarseCoord(pub[key]);
  }
  return coarse;
}

export async function createJob(req, res) {
  const body = req.body || {};
  const serviceCategory = body.serviceCategory || body.service_category || body.category;
  const description = body.description || body.details;
  if (!serviceCategory || !description) throw badRequest('Service category and description are required');
  const latitude = body.latitude || body.customer_latitude || null;
  const longitude = body.longitude || body.customer_longitude || null;
  const scheduledAt = body.scheduledDate || body.scheduled_at || null;
  const propertyId = body.propertyId || body.property_id || null;
  let providerType = body.providerType === 'company' || body.provider_type === 'company'
    ? 'company'
    : (body.providerType === 'platform_match' || body.provider_type === 'platform_match')
      ? 'platform_match'
      : 'fundi';

  // ── Option A (spec §2): customer books a SPECIFIC verified fundi ──
  let preferredFundiId = body.preferredFundiId || body.preferred_fundi_id || body.fundiId || null;
  if (preferredFundiId) {
    const fundiRes = await query(
      `select f.user_id, f.online, f.approval_status, u.status as user_status
       from fundis f join users u on u.id = f.user_id where f.user_id = $1`,
      [preferredFundiId],
    );
    const f = fundiRes.rows[0];
    if (!f || f.approval_status !== 'approved' || f.user_status !== 'active') {
      throw badRequest('This professional is not currently available for booking');
    }
    providerType = 'fundi'; // a direct fundi booking is still an individual-provider job
  }

  // ── Direct company booking (spec §5): customer books a specific company ──
  let companyId = body.companyId || body.company_id || null;
  if (companyId) {
    const companyRes = await query(
      `select id, company_name, status, verification_status from company_profiles where id = $1`,
      [companyId],
    );
    const co = companyRes.rows[0];
    // Spec section 47: bookable = approved + verified + not suspended.
    if (!co || co.status !== 'approved' || co.verification_status !== 'verified') {
      throw badRequest('Company is not available for booking');
    }
    providerType = 'company';
  } else if (providerType === 'company') {
    companyId = null; // open pool — any eligible company can claim
  }

  if (preferredFundiId) {
    // Company choice and fundi choice are mutually exclusive (spec §2).
    companyId = null;
    if (providerType === 'company') providerType = 'fundi';
  }

  // ── Server-authoritative pricing (spec §14): the customer never sets the
  // price. The pricing engine computes the estimate from the category's
  // configured pricing rules; the client's estimate is only a fallback for
  // custom categories that have no pricing configuration yet.
  let finalPrice = null;
  let pricingSource = 'client_estimate_fallback';
  try {
    const { calculateJobPrice } = await import('../services/pricingEngineService.js');
    const enginePrice = await calculateJobPrice({
      serviceCategory,
      distanceKm: 0,
      county: body.county || body.customer_county || null,
      isEmergency: (body.urgency || 'normal') === 'emergency',
      isImmediate: (body.urgency || 'normal') === 'immediate',
      complexity: body.complexity || 'simple',
      scheduledFor: scheduledAt,
    });
    finalPrice = enginePrice.total;
    pricingSource = 'pricing_engine';
  } catch (pricingErr) {
    // No pricing configured for this category — fall back to the client
    // estimate (still validated/clamped downstream at completion/payment).
    finalPrice = body.estimatedPrice || body.estimated_price || null;
    logNonFatal('job.createJob.pricingFallback', pricingErr, { serviceCategory });
  }

  // Company jobs wait for company acceptance (or dispatcher assignment);
  // individual jobs enter geo matching. Direct fundi bookings enter matching
  // too but are only VISIBLE to the chosen fundi (match_metadata guard).
  // Scheduled jobs (either kind) park as scheduled.
  const initialStatus = companyId ? 'pending' : (providerType === 'company' ? 'matching' : (scheduledAt ? 'scheduled' : 'matching'));
  const matchMetadata = {
    ...(preferredFundiId ? { preferredFundiId, choice: 'individual' } : {}),
    ...(providerType === 'platform_match' ? { choice: 'platform_match' } : {}),
    ...(providerType === 'company' ? { choice: companyId ? 'company_direct' : 'company_pool' } : {}),
  };
  const result = await query(
    `insert into jobs (customer_id, service_category, description, location_name, customer_latitude,
      customer_longitude, status, urgency, estimated_price, scheduled_at, company_id, provider_type, property_id, match_metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) returning *`,
    [
      req.user.id,
      serviceCategory,
      description,
      body.formattedAddress || body.formatted_address
      || body.locationName || body.location_name || body.location || body.address || '',
      latitude,
      longitude,
      initialStatus,
      body.urgency || 'normal',
      finalPrice,
      scheduledAt,
      companyId,
      providerType,
      propertyId,
      JSON.stringify(matchMetadata),
    ],
  );
  const job = result.rows[0];
  await query(
    `insert into job_status_updates (job_id, status, actor_id, note) values ($1, 'matching', $2, 'Job created')`,
    [job.id, req.user.id],
  );
  await query(
    `update jobs set match_metadata = $2::jsonb where id = $1`,
    [job.id, JSON.stringify(matchMetadata)],
  );
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'job_created',
    actorId: req.user.id,
    actorRole: req.user.role,
    metadata: { serviceCategory, urgency: body.urgency || 'normal', pricingSource, estimatedPrice: finalPrice },
  });
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'job_posted',
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (body.description) {
    const scan = await scanContent({
      content: body.description,
      userId: req.user.id,
      userRole: req.user.role,
      jobId: job.id,
      source: 'job_notes',
    });
    if (scan.blocked) throw forbidden('Job description contains off-platform contact or payment information');
  }
  emitEvent('job:created', { jobId: job.id, status: initialStatus }, `job:${job.id}`);

  // Company-flow jobs skip individual fundi matching entirely.
  if (providerType === 'company') {
    // Notify the targeted company (if any) that a job is waiting
    if (companyId) {
      const ownerRes = await query(
        `select owner_user_id from company_profiles where id = $1`,
        [companyId],
      );
      if (ownerRes.rows[0]) {
        await query(
          `insert into notifications (user_id, type, title, body, data)
           values ($1, 'company_incoming_job', 'New Incoming Job', $2, $3::jsonb)`,
          [ownerRes.rows[0].owner_user_id,
           `New ${body.urgency === 'emergency' ? 'EMERGENCY ' : ''}${serviceCategory} request received. Open your dispatch board to respond.`,
           JSON.stringify({ jobId: job.id })],
        );
      }
    }
    return res.status(201).json({
      success: true,
      job: publicJob(job),
      matching: { providerType: 'company', companyId, candidates: [], failed: false },
    });
  }

  // ── Option A: direct booking — ONLY the chosen fundi is offered the job ──
  if (preferredFundiId) {
    const offerJob = providerJobView(job);
    emitEvent(
      'job:created',
      { jobId: job.id, job: offerJob, status: 'matching', directRequest: true },
      `user:${preferredFundiId}`,
    );
    const { notify } = await import('../services/notificationService.js');
    await notify({
      userId: preferredFundiId,
      type: 'job_direct_request',
      title: 'Direct Booking Request',
      body: `A customer specifically requested you for a ${serviceCategory} job. Respond soon to keep the booking.`,
      data: { jobId: job.id },
    });
    return res.status(201).json({
      success: true,
      job: publicJob(job),
      matching: {
        providerType: 'fundi',
        mode: 'direct',
        preferredFundiId,
        candidates: [],
        failed: false,
      },
    });
  }

  // ── Option C (spec §2/§13): "Let PataFundi match" — weighted smart match ──
  // Uses the full scoring engine (distance, rating, quality, acceptance,
  // completion, cancellation history, verification, workload) instead of the
  // distance-first fallback. Falls back to nearest-fundis if the engine fails.
  let matchMode = 'broadcast';
  let scoredCandidates = null;
  if (providerType === 'platform_match') {
    try {
      const { findNearbyFundis } = await import('../services/geoMatchingService.js');
      const scored = await findNearbyFundis({
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        serviceCategory,
        isEmergency: (body.urgency || 'normal') === 'emergency',
        customerId: req.user.id,
      });
      if (scored.length) {
        scoredCandidates = scored.slice(0, 8).map((c) => ({
          user_id: c.user_id,
          name: c.name,
          rating: c.rating,
          distanceKm: c.distance_km,
          weighted_score: c.weighted_score,
          scores: c.scores,
          completed_jobs: c.completed_jobs,
          active_jobs: c.active_jobs,
        }));
        matchMode = 'smart_match';
      }
    } catch (matchErr) {
      logNonFatal('job.createJob.smartMatch', matchErr, { jobId: job.id });
    }
  }

  const candidates = scoredCandidates || await findNearestFundis(latitude, longitude, serviceCategory);
  if (!candidates.length) {
    emitEvent('job:search:failed', { jobId: job.id, reason: 'No online fundis available' }, `job:${job.id}`);
    return res.status(201).json({ success: true, job: publicJob(job), matching: { candidates: [], failed: true, mode: matchMode } });
  }
  // Privacy (spec §24): providers that have NOT been accepted yet receive a
  // coarse, area-level view — never the customer's exact address/coordinates.
  const publishedJob = providerJobView(job);
  // Persistent offers (migration 038): makes "new requests", decline and
  // response-rate metrics real database values instead of hardcoded zeros.
  for (const candidate of candidates) {
    await query(
      `insert into fundi_job_offers (job_id, fundi_id) values ($1, $2)
       on conflict (job_id, fundi_id) do nothing`,
      [job.id, candidate.user_id],
    );
    emitEvent(
      'job:created',
      { jobId: job.id, job: publishedJob, distanceKm: candidate.distanceKm, status: 'matching' },
      `user:${candidate.user_id}`,
    );
  }
  emitEvent('job:created', { jobId: job.id, job: publishedJob, candidates, status: 'matching' }, `job:${job.id}`);
  res.status(201).json({ success: true, job: publicJob(job), matching: { candidates, failed: false, mode: matchMode } });
}

export async function uploadJobPhotos(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  const { uploadPrivateFile, getSignedAccessUrl, getSignedThumbUrl } = await import('../services/storageService.js');
  const { mapMulterFiles } = await import('../middleware/upload.js');
  const files = mapMulterFiles(req.files);
  if (!files.length) throw badRequest('At least one photo is required');

  const photos = [];
  let sortOrder = 0;
  for (const file of files) {
    const uploaded = await uploadPrivateFile({
      folder: `jobs/${job.id}`,
      file,
    });
    const row = await query(
      `insert into job_photos (job_id, uploaded_by, r2_key, thumb_r2_key, mime_type, file_size, original_name, width, height, sort_order, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active') returning *`,
      [
        job.id,
        req.user.id,
        uploaded.r2Key,
        uploaded.thumbR2Key,
        uploaded.mimeType,
        uploaded.fileSize,
        file.originalname,
        uploaded.width,
        uploaded.height,
        sortOrder++,
      ],
    );
    photos.push({
      id: row.rows[0].id,
      signedUrl: await getSignedAccessUrl(uploaded.r2Key),
      thumbSignedUrl: await getSignedThumbUrl(uploaded.thumbR2Key, uploaded.r2Key),
      originalName: file.originalname,
      mimeType: uploaded.mimeType,
      size: uploaded.fileSize,
      expiresIn: 900,
    });
  }
  res.status(201).json({ success: true, photos });
}

export async function listJobs(req, res) {
  const column = req.user.role === 'fundi' ? 'fundi_id' : 'customer_id';
  const result = await query(`select * from jobs where ${column} = $1 order by created_at desc`, [req.user.id]);
  res.json({ success: true, jobs: result.rows.map(publicJob) });
}

export async function getJob(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  res.json({ success: true, job: publicJob(job) });
}

export async function getJobStatus(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  res.json({ success: true, status: job.status, updatedAt: job.updated_at, job: publicJob(job) });
}

export async function patchJob(req, res) {
  const { status } = req.body || {};
  if (!status) throw badRequest('Status is required');
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  // Central state machine (spec section 50): validates the edge + actor,
  // performs the update race-safely, records the timeline event and emits
  // realtime events. A quote-phase state has no edge to completion/payment.
  const updated = await transitionJob({
    jobId: job.id,
    toStatus: status,
    actor: req.user,
    job,
  });
  if (status === 'in_progress') emitEvent('job:started', { jobId: job.id, status, job: publicJob(updated) }, `job:${job.id}`);
  if (status === 'cancelled') emitEvent('job:cancelled', { jobId: job.id, status }, `job:${job.id}`);
  res.json({ success: true, job: publicJob(updated) });
}

export async function updateStatus(req, res) {
  req.params.id = req.params.id || req.params.jobId;
  return patchJob(req, res);
}

export async function acceptJob(req, res) {
  const { logAccessDecision } = await import('../middleware/accessDebug.js');
  const fundi = await query(
    `select approval_status from fundis where user_id = $1`,
    [req.user.id],
  );
  await logAccessDecision(req, 'jobs.acceptJob:precheck', {
    approvalStatus: fundi.rows[0]?.approval_status ?? null,
  });
  if (!req.user.isAdmin && fundi.rows[0]?.approval_status !== 'approved') {
    throw forbidden('Only approved fundis can accept jobs');
  }
  const result = await query(
    `update jobs set fundi_id = $2, status = 'accepted', estimated_price = coalesce($3, estimated_price), updated_at = now()
     where id = $1 and status in ('pending', 'matching')
       and (match_metadata->>'preferredFundiId' is null or match_metadata->>'preferredFundiId' = $4)
     returning *`,
    [req.params.id, req.user.id, req.body?.estimatedPrice || null, req.user.id],
  );
  if (result.rows[0]) {
    // Record the acceptance against this fundi's outstanding offer(s), if any.
    await query(
      `update fundi_job_offers set response = 'accepted', responded_at = now()
       where job_id = $1 and fundi_id = $2 and response = 'pending'`,
      [req.params.id, req.user.id],
    );
  }
  if (!result.rows[0]) {
    // Distinguish "already taken" from "reserved for another fundi" (direct booking)
    const current = await query('select match_metadata, status from jobs where id = $1', [req.params.id]);
    const pref = current.rows[0]?.match_metadata?.preferredFundiId;
    if (pref && pref !== req.user.id) throw forbidden('This job was booked directly with another professional');
    throw badRequest('Job cannot be accepted');
  }
  const job = result.rows[0];

  // ── Quote revision (spec §4/§22): if the fundi's quote differs materially
  // from the customer's request, park the job in the quote phase until the
  // customer approves the revised price. The quote is a real entity the
  // customer reviews - never a completion, client cannot bypass.
  const quoted = Number(req.body?.estimatedPrice);
  if (
    result.rows[0].status === 'accepted' &&
    Number.isFinite(quoted) &&
    job.estimated_price != null &&
    Math.abs(quoted - Number(job.estimated_price)) > Math.max(50, Number(job.estimated_price) * 0.25)
  ) {
    const quote = await createQuote({
      jobId: job.id,
      actor: req.user,
      fundiId: req.user.id,
      amount: quoted,
      description: `Revised quote for ${job.service_category} (original estimate KES ${Number(job.estimated_price).toLocaleString()})`,
    });
    return res.json({ success: true, job: publicJob(await loadJob(job.id)), quotePending: true, quote });
  }

  const amount = Number(job.final_price || job.estimated_price || 0);
  if (amount > 0) {
    await createExpectedCommission({
      jobId: job.id,
      fundiId: req.user.id,
      customerId: job.customer_id,
      amount,
    });
  }
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'fundi_matched',
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'fundi_accepted',
    actorId: req.user.id,
    actorRole: req.user.role,
    metadata: { estimatedPrice: job.estimated_price },
  });
  // Central notification (spec §27): the customer must know their job was accepted.
  const { notify } = await import('../services/notificationService.js');
  await notify({
    userId: job.customer_id,
    type: 'job_accepted',
    title: 'Your job was accepted',
    body: 'A verified professional has accepted your job and will be on the way. Track progress live from your dashboard.',
    data: { jobId: job.id, fundiId: req.user.id },
  });
  emitEvent('job:accepted', { jobId: req.params.id, fundiId: req.user.id, status: 'accepted', job: publicJob(job) }, `job:${req.params.id}`);
  emitEvent('fundi:response:ok', { accepted: true, jobId: req.params.id }, `user:${req.user.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function cancelJob(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  // Quote-phase bookings are cancellable too (spec: quote states are still
  // pending work). Terminal states are not.
  if (!req.user.isAdmin && !['pending', 'matching', 'quote_requested', 'offered', 'accepted', 'booking_confirmed', 'scheduled'].includes(job.status)) {
    throw badRequest('Job can no longer be cancelled');
  }
  const result = await query('update jobs set status = $2, cancellation_reason = $3, updated_at = now() where id = $1 and status = $4 returning *', [
    req.params.id,
    'cancelled',
    req.body?.reason || null,
    job.status,
  ]);
  if (!result.rows[0]) throw badRequest('Job status changed, reload and try again');
  // Any live quote dies with the booking.
  await query(
    "update quotes set status = 'cancelled', decided_at = now(), updated_at = now() where job_id = $1 and status in ('draft','sent','viewed')",
    [job.id],
  );
  emitEvent('job:request:declined', { jobId: req.params.id, reason: req.body?.reason || null }, `job:${req.params.id}`);
  emitEvent('job:cancelled', { jobId: req.params.id, status: 'cancelled', reason: req.body?.reason || null }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

/**
 * Fundi declines an offered broadcast job (spec §23).
 * The job itself stays open for other fundis — only the offer record flips
 * to 'declined', which feeds real response-rate metrics (spec §26).
 */
export async function declineJob(req, res) {
  const updated = await query(
    `update fundi_job_offers set response = 'declined', responded_at = now()
     where job_id = $1 and fundi_id = $2 and response = 'pending'
     returning id`,
    [req.params.id, req.user.id],
  );
  res.json({ success: true, declined: updated.rows.length > 0 });
}

export async function checkIn(req, res) {
  const { latitude, longitude, status = 'on_the_way', accuracy = null } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Latitude and longitude are required');
  const allowedStatuses = ['on_the_way', 'arrived', 'in_progress'];
  if (!allowedStatuses.includes(status)) throw badRequest('Invalid check-in status');
  const job = await loadJob(req.params.id);
  requireAssignedFundi(req.user, job);
  // ── State-machine enforcement (spec §17): check-in may only advance the
  // lifecycle forward — never skip backwards or resurrect a finished job.
  const CHECKIN_TRANSITIONS = {
    on_the_way: ['accepted', 'booking_confirmed', 'assigned', 'scheduled'],
    arrived: ['on_the_way', 'accepted', 'booking_confirmed', 'assigned'],
    in_progress: ['arrived', 'on_the_way', 'accepted', 'booking_confirmed', 'assigned'],
  };
  if (!CHECKIN_TRANSITIONS[status].includes(job.status)) {
    throw badRequest(`Invalid status transition: ${job.status} → ${status}`);
  }
  // GPS distance validation: if checking in as 'arrived', verify the fundi is
  // actually near the customer location (within 2km). This prevents fake
  // check-ins from a remote location. For 'on_the_way' status, no distance
  // check needed (fundi is still travelling).
  if (status === 'arrived' && job.customer_latitude && job.customer_longitude) {
    const distance = haversineKm(
      Number(latitude), Number(longitude),
      Number(job.customer_latitude), Number(job.customer_longitude),
    );
    if (distance > 2.0) {
      // Log the suspicious check-in for fraud review instead of hard-blocking
      // (the fundi might be at the building entrance but GPS is slightly off)
      console.warn(`[fraud] Fundi ${req.user.id} checked in as 'arrived' but is ${distance.toFixed(2)}km from customer (job ${req.params.id})`);
      // Record in GPS validations for fraud analysis
      try {
        await query(
          `insert into gps_validations (fundi_id, job_id, latitude, longitude, accuracy, is_spoofed, spoof_indicators, risk_score)
           values ($1, $2, $3, $4, $5, true, $6, 75)`,
          [req.user.id, req.params.id, latitude, longitude, accuracy,
           JSON.stringify(['far_from_customer', `distance_${distance.toFixed(2)}km`])],
        );
      } catch (error) {
        logNonFatal('job.gpsValidationInsert', error, { jobId: req.params.id, fundiId: req.user.id });
      }
    }
  }
  const result = await transaction(async (client) => {
    await client.query(
      `insert into gps_history (job_id, fundi_id, latitude, longitude, accuracy)
       values ($1, $2, $3, $4, $5)`,
      [req.params.id, req.user.id, latitude, longitude, accuracy],
    );
    return client.query(
      `update jobs set status = $2, fundi_latitude = $3, fundi_longitude = $4, updated_at = now()
       where id = $1 returning *`,
      [req.params.id, status, latitude, longitude],
    );
  });
  emitEvent('fundi:location:update', { jobId: req.params.id, latitude, longitude, accuracy, status }, `job:${req.params.id}`);
  emitEvent('job:checkin', { jobId: req.params.id, latitude, longitude, accuracy, status }, `job:${req.params.id}`);
  emitEvent('job:status', { jobId: req.params.id, status, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  if (status === 'in_progress') emitEvent('job:started', { jobId: req.params.id, status, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  // Spec §35: lifecycle milestones must reach the customer beyond the job room
  // (in-app + queued push), not just live sockets. Non-blocking by contract.
  try {
    const { notify } = await import('../services/notificationService.js');
    const subject = job.service_category || 'your job';
    const milestone = status === 'on_the_way'
      ? { type: 'job_fundi_on_the_way', title: 'Your fundi is on the way', body: `Heading to you for your ${subject} job.` }
      : status === 'arrived'
        ? { type: 'job_fundi_arrived', title: 'Your fundi has arrived', body: `Your fundi checked in at the location for your ${subject} job.` }
        : { type: 'job_started', title: 'Work has started', body: `Work started on your ${subject} job.` };
    if (job.customer_id) {
      await notify({ userId: job.customer_id, ...milestone, data: { jobId: job.id, status } });
    }
  } catch (err) {
    logNonFatal('job.checkinNotify', err, { jobId: req.params.id });
  }
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function completeJob(req, res) {
  const job = await loadJob(req.params.id);
  // The assigned fundi - or, for company jobs, any active member of the
  // owning company - may request completion (spec section 6).
  if (job.company_id) {
    const { getMembership } = await import('../middleware/companyAccess.js');
    const membership = await getMembership(job.company_id, req.user.id);
    if (!(req.user.isAdmin && (req.user.role === 'super_admin' || req.user.role === 'admin')) &&
        !(membership && membership.status === 'active') && job.fundi_id !== req.user.id) {
      throw forbidden('Only the assigned professional or the owning company can request completion');
    }
  } else {
    requireAssignedFundi(req.user, job);
  }
  // State-machine enforcement (spec section 6): the provider marks completion
  // REQUESTED. The customer verifies the work with the OTP; only then does
  // payment finalize and the job complete. A provider can never self-complete.
  if (job.status !== 'in_progress') {
    throw badRequest('Job must be in progress before completion - start work first');
  }
  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);
  // ── Server-authoritative final price (spec §17): the provider-suggested
  // final price is clamped to ±25% of the approved estimate. Anything beyond
  // that would require a fresh quote the customer has not approved.
  const estimated = job.estimated_price != null ? Number(job.estimated_price) : null;
  let finalPrice = req.body?.finalPrice != null ? Number(req.body.finalPrice) : null;
  if (finalPrice != null && estimated != null && estimated > 0) {
    const maxAllowed = Math.round(estimated * 1.25);
    const minAllowed = Math.max(0, Math.round(estimated * 0.5));
    if (finalPrice > maxAllowed) finalPrice = maxAllowed;
    if (finalPrice < minAllowed) finalPrice = minAllowed;
  }
  const result = await query(
    `update jobs set status = 'completion_requested', completion_otp_hash = $2,
      final_price = coalesce($3, final_price, estimated_price), updated_at = now()
     where id = $1 and status = 'in_progress' returning *`,
    [req.params.id, otpHash, finalPrice],
  );
  if (!result.rows[0]) throw badRequest('Job status changed concurrently - reload and try again');
  await recordTimelineEvent({
    jobId: req.params.id,
    eventType: 'work_completed',
    actorId: req.user.id,
    actorRole: req.user.role,
    metadata: { status: 'completion_requested' },
  });
  // Deliver the OTP to the customer ONLY on their private user room +
  // notification. Never broadcast the completion OTP to the job room -
  // the fundi is in that room and must not see the confirmation code.
  await query(
    `insert into notifications (user_id, type, title, body, data, category)
     values ($1, 'job_completion_otp', 'Confirm the completed work', $2, $3::jsonb, 'customers')`,
    [
      job.customer_id,
      `Your professional finished booking ${job.booking_number}. Verify the work and enter code ${otp} to confirm.`,
      JSON.stringify({ jobId: job.id, otp, bookingNumber: job.booking_number }),
    ],
  );
  emitEvent('job:completion:requested', { jobId: req.params.id }, `job:${req.params.id}`);
  emitEvent('job:status', { jobId: req.params.id, status: 'completion_requested', job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  emitEvent('job:completion:otp', { jobId: req.params.id, otp }, `user:${job.customer_id}`);
  res.json({ success: true, job: publicJob(result.rows[0]), completionOtpIssued: true });
}

// ── Resend completion code (customer-only): re-issues a fresh OTP while the
// job is completed-but-unconfirmed. Covers missed sockets/notifications.
export async function resendCompletionCode(req, res) {
  const existing = await query('select * from jobs where id = $1', [req.params.id]);
  const job = existing.rows[0];
  if (!job) throw notFound('Job not found');
  requireCustomer(req.user, job);
  const pendingStates = ['completed', 'completion_requested', 'customer_confirmed_completion'];
  if (!pendingStates.includes(job.status) || job.customer_completion_confirmed) {
    throw badRequest('No pending completion confirmation for this job');
  }
  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);
  await query(
    'update jobs set completion_otp_hash = $2, updated_at = now() where id = $1',
    [req.params.id, otpHash],
  );
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_completion_otp', 'Your confirmation code', $2, $3::jsonb)`,
    [job.customer_id, `Use code ${otp} to confirm the completed job.`, JSON.stringify({ jobId: job.id, otp })],
  );
  emitEvent('job:completion:otp', { jobId: req.params.id, otp }, `user:${job.customer_id}`);
  // Returning the code to the authenticated CUSTOMER is correct — it is their
  // confirmation code (the fundi can never fetch this endpoint). This powers
  // the "resend code" affordance and keeps confirmation working without sockets.
  res.json({ success: true, completionOtpIssued: true, completionOtp: otp });
}

export async function confirmCompletion(req, res) {
  const { otp } = req.body || {};
  if (!otp) throw badRequest('OTP is required');
  const existing = await query('select * from jobs where id = $1', [req.params.id]);
  const job = existing.rows[0];
  if (!job) throw notFound('Job not found');
  requireCustomer(req.user, job);
  // Prevent double-confirmation — if already confirmed, return success without
  // re-processing (idempotent). This prevents duplicate escrow releases
  // and duplicate notifications.
  if (job.customer_completion_confirmed) {
    return res.json({ success: true, job: publicJob(job), alreadyConfirmed: true });
  }
  const otpResult = await verifyJobCompletionOtp({
    jobId: req.params.id,
    otp,
    verifyHash: (hash, code) => bcrypt.compare(String(code), hash),
  });
  if (!otpResult.ok) throw forbidden(otpResult.error);
  // Clear the OTP hash so it can't be reused (one-time use). The customer
  // verified the work: completion_requested (or legacy completed) ->
  // customer_confirmed_completion via the central machine.
  const result = await query(
    `update jobs set customer_completion_confirmed = true, payment_status = 'customer_confirmed',
      escrow_status = 'completion_requested', completion_otp_hash = null,
      status = 'customer_confirmed_completion', updated_at = now()
     where id = $1 and customer_completion_confirmed = false
       and status in ('completion_requested', 'completed') returning *`,
    [req.params.id],
  );
  // If no rows updated, another request confirmed it concurrently - return idempotent success
  if (!result.rows[0]) {
    const current = await query('select * from jobs where id = $1', [req.params.id]);
    return res.json({ success: true, job: publicJob(current.rows[0]), alreadyConfirmed: true });
  }
  await markCommissionCustomerConfirmed(req.params.id);
  await recordTimelineEvent({
    jobId: req.params.id,
    eventType: 'customer_confirmed',
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  emitEvent('job:completion:confirmed', { jobId: req.params.id, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  emitEvent('job:status', { jobId: req.params.id, status: 'customer_confirmed_completion', job: publicJob(result.rows[0]) }, `job:${req.params.id}`);

  // ── Auto-release escrow via the shared settlement service ─────────
  // Server-authoritative split, fundi wallet credit OR company settlement,
  // revenue ledger, notifications and audit are all handled atomically.
  // On success the payment is confirmed and the booking completes (spec
  // section 6: payment finalized -> COMPLETED). A settlement failure leaves
  // the booking honestly at customer_confirmed_completion - never silently
  // completed without payment.
  let paymentFinalized = false;
  try {
    const { releaseJobEscrow } = await import('../services/settlementService.js');
    await releaseJobEscrow({ jobId: req.params.id, actorId: req.user.id, actorRole: req.user.role, source: 'customer_confirmation' });
    paymentFinalized = true;
  } catch (err) {
    console.warn('[escrow] auto-release failed (non-blocking, admin can release manually):', err.message);
  }
  let finalJob = result.rows[0];
  if (paymentFinalized) {
    const done = await query(
      `update jobs set status = 'completed', payment_status = 'payout_completed', updated_at = now()
       where id = $1 and status = 'customer_confirmed_completion' returning *`,
      [req.params.id],
    );
    if (done.rows[0]) {
      finalJob = done.rows[0];
      emitEvent('job:status', { jobId: req.params.id, status: 'completed', job: publicJob(finalJob) }, `job:${req.params.id}`);
      emitEvent('job:completed', { jobId: req.params.id }, `job:${req.params.id}`);
      await recordTimelineEvent({
        jobId: req.params.id, eventType: 'status_completed', actorId: req.user.id,
        actorRole: req.user.role, metadata: { from: 'customer_confirmed_completion', to: 'completed' },
      });
    }
  }

  res.json({ success: true, job: publicJob(finalJob), paymentFinalized });
}

export async function activeFundiJob(req, res) {
  const { logAccessDecision } = await import('../middleware/accessDebug.js');
  await logAccessDecision(req, 'jobs.activeFundiJob:enter');
  const assigned = await query(
    `select * from jobs where fundi_id = $1 and status not in ('completed', 'cancelled') order by updated_at desc limit 1`,
    [req.user.id],
  );
  if (assigned.rows[0]) return res.json({ success: true, job: publicJob(assigned.rows[0]) });

  const fundi = await query('select skills, latitude, longitude, online from fundis where user_id = $1 and approval_status = $2', [req.user.id, 'approved']);
  if (!fundi.rows[0]?.online) return res.json({ success: true, job: null });
  // Open pool + jobs directly booked with THIS fundi (spec §2 Option A).
  // Direct bookings (match_metadata.preferredFundiId) are invisible to everyone else.
  const available = await query(
    `select j.*, u.full_name as customer_name
     from jobs j join users u on u.id = j.customer_id
     where j.fundi_id is null and j.status = 'matching'
       and (j.provider_type = 'fundi' or j.provider_type = 'platform_match')
       and (j.match_metadata->>'preferredFundiId' is null or j.match_metadata->>'preferredFundiId' = $1)
     order by j.created_at asc limit 25`,
    [req.user.id],
  );
  const skills = (fundi.rows[0].skills || []).map((skill) => String(skill).toLowerCase());
  const lat = Number(fundi.rows[0].latitude);
  const lon = Number(fundi.rows[0].longitude);
  const matches = available.rows
    .filter((job) => !skills.length || skills.includes(String(job.service_category || '').toLowerCase()))
    .map((job) => ({
      ...job,
      distanceKm: Number.isFinite(lat) && Number.isFinite(lon) && job.customer_latitude != null && job.customer_longitude != null
        ? haversineKm(lat, lon, Number(job.customer_latitude), Number(job.customer_longitude))
        : null,
    }))
    .sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
  const next = matches[0];
  if (!next) return res.json({ success: true, job: null });
  res.json({
    success: true,
    job: {
      ...providerJobView(next),
      customer_name: next.customer_name,
      distanceKm: next.distanceKm,
    },
  });
}

export async function submitReview(req, res) {
  const { jobId = req.params.id, rating, comment = '' } = req.body || {};
  if (!jobId || !rating) throw badRequest('Job and rating are required');
  const job = await loadJob(jobId);
  requireCustomer(req.user, job);
  if (job.status !== 'completed' || !job.customer_completion_confirmed) {
    throw badRequest('Only completed jobs can be reviewed');
  }
  if (comment) {
    const scan = await scanContent({
      content: comment,
      userId: req.user.id,
      userRole: req.user.role,
      jobId,
      source: 'review',
    });
    if (scan.blocked) throw forbidden('Review contains off-platform contact or payment information');
  }
  const result = await query(
    `insert into reviews (job_id, reviewer_id, rating, comment)
     values ($1, $2, $3, $4) returning *`,
    [jobId, req.user.id, rating, comment],
  );
  if (Number(rating) >= 4 && job.fundi_id) {
    await rewardTrust({ userId: job.fundi_id, reason: 'Positive review', bonusKey: 'positive_review' });
  }
  emitEvent('review:submitted', { jobId, reviewId: result.rows[0].id }, `job:${jobId}`);
  emitEvent('trust:updated', { userId: job.fundi_id, jobId }, `user:${job.fundi_id}`);
  res.status(201).json({ success: true, review: result.rows[0] });
}

// ── Customer quote decision (spec §22): accept or decline the live quote ──
// The Quote entity carries its own lifecycle; acceptance confirms the booking
// (booking_confirmed) - it never completes the job. Decline re-opens matching
// while keeping the booking available for another quote.
export async function decideQuote(req, res) {
  const { decision, note } = req.body || {};
  if (!['approve', 'reject', 'accept', 'decline'].includes(decision)) {
    throw badRequest('decision must be accept or decline');
  }
  const normalized = decision === 'approve' ? 'accept' : decision === 'reject' ? 'decline' : decision;
  const result = await decideQuoteEntity({
    jobId: req.params.id,
    decision: normalized,
    customer: req.user,
    note: note || null,
  });
  res.json({ success: true, quote: result.quote, job: publicJob(result.job) });
}

// ── Quote details for a booking (customer + participants) ──
export async function getJobQuote(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  const quote = await getLiveQuoteForJob(job.id);
  if (quote && quote.status === 'sent' && req.user.id === job.customer_id) {
    const { markQuoteViewed, getLiveQuoteForJob: reload } = await import('../services/quoteService.js');
    const viewed = await markQuoteViewed(quote.id, req.user);
    // Reload the joined row so companyName/bookingNumber stay populated.
    if (viewed) {
      const fresh = await reload(job.id);
      res.json({ success: true, quote: fresh || quote });
      return;
    }
  }
  res.json({ success: true, quote });
}

// ── Customer asks a question on the live quote (spec §3 Ask a Question) ──
export async function askQuoteQuestion(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  const quote = await addQuoteQuestion({
    jobId: job.id,
    customer: req.user,
    question: req.body?.question,
  });
  res.json({ success: true, quote });
}

// ── Job stats from the DATABASE (spec §7/§8) - dashboards never compute
// counts from UI state. Role-aware definitions:
//   customer: active = pending..completion_requested + payment phases;
//             completed = payment_confirmed/completed/closed
//   provider: active = accepted..completion_requested; completed = completed/closed
export async function getJobStats(req, res) {
  const userId = req.user.id;
  const isCustomerView = !['fundi'].includes(req.user.role) || req.query.view === 'customer';
  if (req.user.role === 'fundi' && req.query.view !== 'customer') {
    const res1 = await query(
      `select
         count(*) filter (where status in ('accepted','offered','booking_confirmed','scheduled','on_the_way','arrived','in_progress','completion_requested')) as active_jobs,
         count(*) filter (where status in ('completed','closed')) as completed_jobs,
         count(*) filter (where status = 'cancelled') as cancelled_jobs,
         count(*) filter (where status = 'disputed') as disputed_jobs,
         count(*) filter (where status = 'offered') as pending_quotes,
         count(*) as total
       from jobs where fundi_id = $1`,
      [userId],
    );
    const row = res1.rows[0] || {};
    return res.json({
      success: true,
      stats: {
        totalBookings: Number(row.total || 0),
        activeJobs: Number(row.active_jobs || 0),
        completedJobs: Number(row.completed_jobs || 0),
        cancelledJobs: Number(row.cancelled_jobs || 0),
        disputedJobs: Number(row.disputed_jobs || 0),
        pendingQuotes: Number(row.pending_quotes || 0),
        pendingCustomerActions: 0,
      },
    });
  }
  const res2 = await query(
    `select
       count(*) as total_bookings,
       count(*) filter (where status in ('pending','matching','quote_requested','offered','accepted','booking_confirmed','assigned','scheduled','on_the_way','arrived','in_progress','completion_requested','customer_confirmed_completion','payment_pending','payment_processing')) as active_bookings,
       count(*) filter (where status in ('pending','matching','quote_requested','offered','accepted','booking_confirmed','assigned','scheduled','on_the_way','arrived','in_progress','completion_requested')) as active_jobs,
       count(*) filter (where status in ('payment_confirmed','completed','closed')) as completed_jobs,
       count(*) filter (where status = 'offered') as pending_quotes,
       count(*) filter (where status in ('offered','completion_requested')) as pending_customer_actions,
       count(*) filter (where status = 'cancelled') as cancelled_jobs,
       count(*) filter (where status = 'disputed') as disputed_jobs
     from jobs where customer_id = $1`,
    [userId],
  );
  const row = res2.rows[0] || {};
  res.json({
    success: true,
    stats: {
      totalBookings: Number(row.total_bookings || 0),
      activeBookings: Number(row.active_bookings || 0),
      activeJobs: Number(row.active_jobs || 0),
      completedJobs: Number(row.completed_jobs || 0),
      pendingQuotes: Number(row.pending_quotes || 0),
      pendingCustomerActions: Number(row.pending_customer_actions || 0),
      cancelledJobs: Number(row.cancelled_jobs || 0),
      disputedJobs: Number(row.disputed_jobs || 0),
    },
  });
}

// ── Multi-property (spec §25): customer property book CRUD ──
export async function listProperties(req, res) {
  const result = await query(
    `select * from customer_properties where customer_id = $1 order by is_default desc, created_at desc`,
    [req.user.id],
  );
  res.json({ success: true, properties: result.rows });
}

export async function createProperty(req, res) {
  const b = req.body || {};
  if (!b.label) throw badRequest('label is required');
  if (b.isDefault) {
    await query(`update customer_properties set is_default = false where customer_id = $1`, [req.user.id]);
  }
  const result = await query(
    `insert into customer_properties (customer_id, label, property_type, address_line, location_name, latitude, longitude, access_notes, is_default)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, false)) returning *`,
    [req.user.id, b.label, b.propertyType || 'home', b.addressLine || null, b.locationName || null,
     b.latitude || null, b.longitude || null, b.accessNotes || null, b.isDefault ?? false],
  );
  res.status(201).json({ success: true, property: result.rows[0] });
}

export async function updateProperty(req, res) {
  const own = await query(
    `select id from customer_properties where id = $1 and customer_id = $2`,
    [req.params.id, req.user.id],
  );
  if (!own.rows[0]) throw notFound('Property not found');
  const b = req.body || {};
  if (b.isDefault) {
    await query(`update customer_properties set is_default = false where customer_id = $1`, [req.user.id]);
  }
  const result = await query(
    `update customer_properties set label = coalesce($2, label), property_type = coalesce($3, property_type),
       address_line = coalesce($4, address_line), location_name = coalesce($5, location_name),
       latitude = coalesce($6, latitude), longitude = coalesce($7, longitude),
       access_notes = coalesce($8, access_notes), is_default = coalesce($9, is_default), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, b.label ?? null, b.propertyType ?? null, b.addressLine ?? null, b.locationName ?? null,
     b.latitude ?? null, b.longitude ?? null, b.accessNotes ?? null,
     typeof b.isDefault === 'boolean' ? b.isDefault : null],
  );
  res.json({ success: true, property: result.rows[0] });
}

export async function deleteProperty(req, res) {
  const result = await query(
    `delete from customer_properties where id = $1 and customer_id = $2 returning id`,
    [req.params.id, req.user.id],
  );
  if (!result.rows[0]) throw notFound('Property not found');
  res.json({ success: true });
}

// ── Provider review response (spec §29): only the reviewed provider can
// reply to a review tied to their own completed job. One editable reply. ──
export async function replyToReview(req, res) {
  const reviewId = parseUuid(req.params.id, 'review id');
  const { reply } = req.body || {};
  const text = String(reply || '').trim();
  if (!text) throw badRequest('Reply text is required');
  if (text.length > 1000) throw badRequest('Reply is too long (1000 characters max)');

  const reviewRes = await query(
    `select r.*, j.fundi_id, j.company_id, j.provider_type
     from reviews r join jobs j on j.id = r.job_id
     where r.id = $1`,
    [reviewId],
  );
  const review = reviewRes.rows[0];
  if (!review) throw notFound('Review not found');
  if (review.hidden) throw badRequest('This review is under moderation and cannot be replied to');

  let allowed = review.fundi_id === req.user.id;
  if (!allowed && review.company_id) {
    const { getMembership } = await import('../middleware/companyAccess.js');
    const membership = await getMembership(review.company_id, req.user.id);
    allowed = Boolean(membership && membership.status === 'active'
      && ['owner', 'admin', 'manager'].includes(membership.role));
  }
  if (!allowed) throw forbidden('Only the reviewed provider can respond to this review');

  if (text) {
    const scan = await scanContent({
      content: text,
      userId: req.user.id,
      userRole: req.user.role,
      jobId: review.job_id,
      source: 'review_reply',
    });
    if (scan.blocked) throw forbidden('Reply contains off-platform contact or payment information');
  }

  const result = await query(
    `update reviews set provider_reply = $2, provider_reply_at = now() where id = $1 returning *`,
    [reviewId, text],
  );
  res.json({ success: true, review: result.rows[0] });
}
