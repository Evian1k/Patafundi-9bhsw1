import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound, parseUuid } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { logNonFatal } from '../utils/logError.js';
import { recordTimelineEvent, recordJobStatusTimeline } from '../services/timelineService.js';
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

  if (latitude == null || longitude == null) {
    const fallback = await query(
      `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score
       from fundis f join users u on u.id = f.user_id
       where ${baseWhere}
       order by f.rating desc nulls last, f.trust_score desc nulls last limit $1`,
      [limit],
    );
    return fallback.rows.map((row) => ({ ...row, distanceKm: null }));
  }
  const result = await query(
    `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
            f.latitude, f.longitude
     from fundis f join users u on u.id = f.user_id
     where ${baseWhere}
       and f.latitude is not null and f.longitude is not null`,
  );
  return result.rows
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
}

async function canAccessJob(user, job) {
  if (!user) return false;
  if (user.role === 'admin' || job.customer_id === user.id || job.fundi_id === user.id) return true;
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
  if (user.role === 'admin') return;
  if (job.fundi_id !== user.id) throw forbidden('Only the assigned fundi can update this job');
}

function requireCustomer(user, job) {
  if (user.role === 'admin') return;
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

export async function createJob(req, res) {
  const body = req.body || {};
  const serviceCategory = body.serviceCategory || body.service_category || body.category;
  const description = body.description || body.details;
  if (!serviceCategory || !description) throw badRequest('Service category and description are required');
  const latitude = body.latitude || body.customer_latitude || null;
  const longitude = body.longitude || body.customer_longitude || null;
  const scheduledAt = body.scheduledDate || body.scheduled_at || null;
  const propertyId = body.propertyId || body.property_id || null;
  let providerType = body.providerType === 'company' || body.provider_type === 'company' ? 'company' : 'fundi';

  // ── Direct company booking (spec §5): customer books a specific company ──
  let companyId = body.companyId || body.company_id || null;
  if (companyId) {
    const companyRes = await query(
      `select id, company_name, status from company_profiles where id = $1`,
      [companyId],
    );
    if (!companyRes.rows[0] || companyRes.rows[0].status !== 'approved') {
      throw badRequest('Company is not available for booking');
    }
    providerType = 'company';
  } else if (providerType === 'company') {
    companyId = null; // open pool — any eligible company can claim
  }

  // ── Referral voucher application ────────────────────────────────────
  // If the customer requests to use a voucher AND has an active voucher,
  // apply the discount to the job's server-computed price.
  // Single-use, non-stackable, validated server-side.
  let voucherApplied = null;

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
  if (body.useReferralVoucher === true && finalPrice && Number(finalPrice) > 0) {
    try {
      const { applyVoucherToJob, confirmVoucherRedemption } = await import('../services/referralService.js');
      const result = await applyVoucherToJob(req.user.id, Number(finalPrice), 0);
      if (result.applied) {
        finalPrice = Math.max(0, Number(finalPrice) - Number(result.discount));
        voucherApplied = {
          voucherId: result.voucherId,
          voucherCode: result.voucherCode,
          discountKes: result.discount,
          discountPercentage: result.discountPercentage,
        };
      }
    } catch (err) {
      console.warn('[referral] voucher application failed (non-blocking):', err.message);
    }
  }

  // Company jobs wait for company acceptance (or dispatcher assignment);
  // individual jobs enter geo matching. Scheduled jobs (either kind) park as scheduled.
  const initialStatus = companyId ? 'pending' : (providerType === 'company' ? 'matching' : (scheduledAt ? 'scheduled' : 'matching'));
  const result = await query(
    `insert into jobs (customer_id, service_category, description, location_name, customer_latitude,
      customer_longitude, status, urgency, estimated_price, scheduled_at, company_id, provider_type, property_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
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
    ],
  );
  const job = result.rows[0];
  await query(
    `insert into job_status_updates (job_id, status, actor_id, note) values ($1, 'matching', $2, 'Job created')`,
    [job.id, req.user.id],
  );
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'job_created',
    actorId: req.user.id,
    actorRole: req.user.role,
    metadata: { serviceCategory, urgency: body.urgency || 'normal', voucherApplied, pricingSource, estimatedPrice: finalPrice },
  });
  await recordTimelineEvent({
    jobId: job.id,
    eventType: 'job_posted',
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  // ── Confirm voucher redemption (after job is created) ──────────────
  if (voucherApplied) {
    try {
      const { confirmVoucherRedemption } = await import('../services/referralService.js');
      await confirmVoucherRedemption({
        voucherId: voucherApplied.voucherId,
        jobId: job.id,
        userId: req.user.id,
        originalPrice: Number(finalPrice),
        discountApplied: voucherApplied.discountKes,
        ipAddress: req.ip,
      });
    } catch (err) {
      console.warn('[referral] voucher redemption confirmation failed (non-blocking):', err.message);
    }
  }
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

  const candidates = await findNearestFundis(latitude, longitude, serviceCategory);
  if (!candidates.length) {
    emitEvent('job:search:failed', { jobId: job.id, reason: 'No online fundis available' }, `job:${job.id}`);
    return res.status(201).json({ success: true, job: publicJob(job), matching: { candidates: [], failed: true } });
  }
  const publishedJob = publicJob(job);
  for (const candidate of candidates) {
    emitEvent(
      'job:created',
      { jobId: job.id, job: publishedJob, distanceKm: candidate.distanceKm, status: 'matching' },
      `user:${candidate.user_id}`,
    );
  }
  emitEvent('job:created', { jobId: job.id, job: publishedJob, candidates, status: 'matching' }, `job:${job.id}`);
  res.status(201).json({ success: true, job: publishedJob, matching: { candidates, failed: false } });
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

// ── Job lifecycle state machine (spec §21) — no arbitrary status jumps ──
const JOB_TRANSITIONS = {
  pending: ['matching', 'accepted', 'assigned', 'scheduled', 'offered', 'cancelled'],
  matching: ['pending', 'accepted', 'assigned', 'scheduled', 'offered', 'cancelled'],
  offered: ['accepted', 'matching', 'cancelled'],
  scheduled: ['accepted', 'assigned', 'on_the_way', 'cancelled'],
  accepted: ['assigned', 'on_the_way', 'cancelled'],
  assigned: ['on_the_way', 'arrived', 'accepted', 'cancelled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'on_the_way', 'cancelled'],
  in_progress: ['completed', 'completion_requested', 'cancelled'],
  completion_requested: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  failed: [],
  expired: [],
};

export async function patchJob(req, res) {
  const { status } = req.body || {};
  if (!status) throw badRequest('Status is required');
  const allowedStatuses = Object.keys(JOB_TRANSITIONS);
  if (!allowedStatuses.includes(status)) throw badRequest('Invalid job status');
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  if (!JOB_TRANSITIONS[job.status]?.includes(status)) {
    throw badRequest(`Invalid status transition: ${job.status} → ${status}`);
  }
  if (req.user.role !== 'admin') {
    if (['on_the_way', 'arrived', 'in_progress', 'completed'].includes(status)) requireAssignedFundi(req.user, job);
    if (['cancelled'].includes(status)) requireCustomer(req.user, job);
  }
  const result = await query('update jobs set status = $2, updated_at = now() where id = $1 returning *', [req.params.id, status]);
  await recordJobStatusTimeline(result.rows[0], status, req.user.id, req.user.role);
  emitEvent('job:status', { jobId: req.params.id, status, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  if (status === 'in_progress') emitEvent('job:started', { jobId: req.params.id, status, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  if (status === 'cancelled') emitEvent('job:cancelled', { jobId: req.params.id, status }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
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
  if (req.user.role !== 'admin' && fundi.rows[0]?.approval_status !== 'approved') {
    throw forbidden('Only approved fundis can accept jobs');
  }
  const result = await query(
    `update jobs set fundi_id = $2, status = 'accepted', estimated_price = coalesce($3, estimated_price), updated_at = now()
     where id = $1 and status in ('pending', 'matching') returning *`,
    [req.params.id, req.user.id, req.body?.estimatedPrice || null],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be accepted');
  const job = result.rows[0];

  // ── Quote revision (spec §4/§22): if the fundi's quote differs materially
  // from the customer's request, park the job as 'offered' until the customer
  // approves the revised price. Server stores the quote — client cannot bypass.
  const quoted = Number(req.body?.estimatedPrice);
  if (
    result.rows[0].status === 'accepted' &&
    Number.isFinite(quoted) &&
    job.estimated_price != null &&
    Math.abs(quoted - Number(job.estimated_price)) > Math.max(50, Number(job.estimated_price) * 0.25)
  ) {
    const revised = await query(
      `update jobs set estimated_price = $2, status = 'offered', updated_at = now() where id = $1 returning *`,
      [req.params.id, quoted],
    );
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'job_quote', 'Price Quote Update', $2, $3::jsonb)`,
      [job.customer_id,
       `The fundi quoted KES ${quoted.toLocaleString()} for your ${job.service_category} job (original estimate KES ${Number(job.estimated_price).toLocaleString()}). Approve the quote to start work.`,
       JSON.stringify({ jobId: job.id, quoted })],
    );
    emitEvent('job:quote', { jobId: job.id, amount: quoted }, `job:${job.id}`);
    return res.json({ success: true, job: publicJob(revised.rows[0]), quotePending: true });
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
  emitEvent('job:accepted', { jobId: req.params.id, fundiId: req.user.id, status: 'accepted', job: publicJob(job) }, `job:${req.params.id}`);
  emitEvent('fundi:response:ok', { accepted: true, jobId: req.params.id }, `user:${req.user.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function cancelJob(req, res) {
  const job = await loadJob(req.params.id);
  await requireJobAccess(req.user, job);
  if (req.user.role !== 'admin' && !['pending', 'matching', 'accepted'].includes(job.status)) {
    throw badRequest('Job can no longer be cancelled');
  }
  const result = await query('update jobs set status = $2, cancellation_reason = $3, updated_at = now() where id = $1 returning *', [
    req.params.id,
    'cancelled',
    req.body?.reason || null,
  ]);
  emitEvent('job:request:declined', { jobId: req.params.id, reason: req.body?.reason || null }, `job:${req.params.id}`);
  emitEvent('job:cancelled', { jobId: req.params.id, status: 'cancelled', reason: req.body?.reason || null }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
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
    on_the_way: ['accepted', 'assigned', 'scheduled'],
    arrived: ['on_the_way', 'accepted', 'assigned'],
    in_progress: ['arrived', 'on_the_way', 'accepted', 'assigned'],
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
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function completeJob(req, res) {
  const job = await loadJob(req.params.id);
  requireAssignedFundi(req.user, job);
  // State-machine enforcement: completion is only valid while work is in
  // progress (arrived → complete skips the started-work step).
  if (job.status !== 'in_progress') {
    throw badRequest('Job must be in progress before completion — start work first');
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
    `update jobs set status = 'completed', completion_otp_hash = $2,
      final_price = coalesce($3, final_price, estimated_price), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, otpHash, finalPrice],
  );
  await recordTimelineEvent({
    jobId: req.params.id,
    eventType: 'work_completed',
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  // Deliver the OTP to the customer ONLY on their private user room +
  // notification. Never broadcast the completion OTP to the job room —
  // the fundi is in that room and must not see the confirmation code.
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_completion_otp', 'Job Complete — Confirm with Code', $2, $3::jsonb)`,
    [
      job.customer_id,
      `Your fundi has completed the job. Use code ${otp} to confirm completion.`,
      JSON.stringify({ jobId: job.id, otp }),
    ],
  );
  emitEvent('job:completed', { jobId: req.params.id }, `job:${req.params.id}`);
  emitEvent('job:status', { jobId: req.params.id, status: 'completed', job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
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
  if (job.status !== 'completed' || job.customer_completion_confirmed) {
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
  // re-processing (idempotent). This prevents duplicate referral vouchers,
  // duplicate escrow releases, and duplicate notifications.
  if (job.customer_completion_confirmed) {
    return res.json({ success: true, job: publicJob(job), alreadyConfirmed: true });
  }
  const otpResult = await verifyJobCompletionOtp({
    jobId: req.params.id,
    otp,
    verifyHash: (hash, code) => bcrypt.compare(String(code), hash),
  });
  if (!otpResult.ok) throw forbidden(otpResult.error);
  // Clear the OTP hash so it can't be reused (one-time use)
  const result = await query(
    `update jobs set customer_completion_confirmed = true, payment_status = 'customer_confirmed',
      escrow_status = 'completion_requested', completion_otp_hash = null, updated_at = now()
     where id = $1 and customer_completion_confirmed = false returning *`,
    [req.params.id],
  );
  // If no rows updated, another request confirmed it concurrently — return idempotent success
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

  // ── Auto-release escrow via the shared settlement service ─────────
  // Server-authoritative split, fundi wallet credit OR company settlement,
  // revenue ledger, notifications and audit are all handled atomically.
  try {
    const { releaseJobEscrow } = await import('../services/settlementService.js');
    await releaseJobEscrow({ jobId: req.params.id, actorId: req.user.id, actorRole: req.user.role, source: 'customer_confirmation' });
  } catch (err) {
    console.warn('[escrow] auto-release failed (non-blocking, admin can release manually):', err.message);
  }

  // ── Referral voucher issuance ────────────────────────────────────────
  // After a job is confirmed completed + paid, check if the customer was a
  // referee whose first paid job this is. If so, issue a discount voucher
  // to the referrer (subject to fraud checks).
  // Non-blocking — failures here must not break the job completion flow.
  try {
    const { processJobCompletionForReferral } = await import('../services/referralService.js');
    const jobValue = Number(job.final_price || job.estimated_price || 0);
    await processJobCompletionForReferral(req.params.id, req.user.id, jobValue);
  } catch (err) {
    console.warn('[referral] voucher issuance failed (non-blocking):', err.message);
  }

  res.json({ success: true, job: publicJob(result.rows[0]) });
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
  const available = await query(
    `select j.*, u.full_name as customer_name
     from jobs j join users u on u.id = j.customer_id
     where j.fundi_id is null and j.status = 'matching'
     order by j.created_at asc limit 25`,
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
      ...publicJob(next),
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

// ── Customer quote decision (spec §22): approve or reject a revised quote ──
// Only the job's customer can decide. Approve resumes the normal workflow;
// reject releases the provider and re-opens matching.
export async function decideQuote(req, res) {
  const { decision } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) throw badRequest('decision must be approve or reject');
  const job = await loadJob(req.params.id);
  requireCustomer(req.user, job);
  if (job.status !== 'offered') throw badRequest('This job has no pending quote to decide');
  if (decision === 'approve') {
    const result = await query(
      `update jobs set status = case when company_id is null then 'accepted' else 'accepted' end,
        updated_at = now() where id = $1 returning *`,
      [req.params.id],
    );
    const updated = result.rows[0];
    await recordTimelineEvent({
      jobId: req.params.id, eventType: 'quote_approved', actorId: req.user.id, actorRole: req.user.role,
      metadata: { amount: updated.estimated_price },
    });
    // Notify whoever sent the quote
    if (updated.company_id) {
      const ownerRes = await query('select owner_user_id from company_profiles where id = $1', [updated.company_id]);
      if (ownerRes.rows[0]) {
        await query(
          `insert into notifications (user_id, type, title, body, data)
           values ($1, 'quote_approved', 'Quote Approved', $2, $3::jsonb)`,
          [ownerRes.rows[0].owner_user_id, 'The customer approved your quote. Assign a technician to proceed.',
           JSON.stringify({ jobId: updated.id })],
        );
      }
    } else if (updated.fundi_id) {
      await query(
        `insert into notifications (user_id, type, title, body, data)
         values ($1, 'quote_approved', 'Quote Approved', $2, $3::jsonb)`,
        [updated.fundi_id, 'The customer approved your quote. You can now proceed with the job.',
         JSON.stringify({ jobId: updated.id })],
      );
    }
    emitEvent('job:status', { jobId: updated.id, status: 'accepted' }, `job:${updated.id}`);
    return res.json({ success: true, job: publicJob(updated) });
  }
  const result = await query(
    `update jobs set status = case when company_id is null then 'matching' else 'matching' end,
      fundi_id = case when company_id is null then null else fundi_id end,
      technician_user_id = null, updated_at = now() where id = $1 returning *`,
    [req.params.id],
  );
  await recordTimelineEvent({
    jobId: req.params.id, eventType: 'quote_rejected', actorId: req.user.id, actorRole: req.user.role,
  });
  emitEvent('job:status', { jobId: req.params.id, status: 'matching' }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
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
