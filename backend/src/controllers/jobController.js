import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { emitEvent } from '../realtime.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestFundis(latitude, longitude, skill, limit = 5) {
  if (latitude == null || longitude == null) {
    const fallback = await query(
      `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score
       from fundis f join users u on u.id = f.user_id
       where f.approval_status = 'approved' and f.online = true
       order by f.rating desc limit $1`,
      [limit],
    );
    return fallback.rows.map((row) => ({ ...row, distanceKm: null }));
  }
  const result = await query(
    `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
            f.latitude, f.longitude
     from fundis f join users u on u.id = f.user_id
     where f.approval_status = 'approved' and f.online = true
       and f.latitude is not null and f.longitude is not null`,
  );
  return result.rows
    .map((row) => ({
      ...row,
      distanceKm: haversineKm(latitude, longitude, Number(row.latitude), Number(row.longitude)),
    }))
    .filter((row) => !skill || row.skills?.includes(skill))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

function canAccessJob(user, job) {
  return user.role === 'admin' || job.customer_id === user.id || job.fundi_id === user.id;
}

function requireJobAccess(user, job) {
  if (!canAccessJob(user, job)) throw forbidden('Not allowed to access this job');
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
  const result = await query('select * from jobs where id = $1', [jobId]);
  if (!result.rows[0]) throw notFound('Job not found');
  return result.rows[0];
}

function publicJob(job) {
  if (!job) return null;
  return {
    ...job,
    title: job.title || `${job.service_category || 'Service'} job`,
    category: job.service_category,
    location: job.location_name,
    latitude: job.customer_latitude == null ? undefined : Number(job.customer_latitude),
    longitude: job.customer_longitude == null ? undefined : Number(job.customer_longitude),
    estimatedPrice: job.estimated_price == null ? undefined : Number(job.estimated_price),
    finalPrice: job.final_price == null ? undefined : Number(job.final_price),
    updatedAt: job.updated_at,
  };
}

export async function createJob(req, res) {
  const body = req.body || {};
  const serviceCategory = body.serviceCategory || body.service_category || body.category;
  const description = body.description || body.details;
  if (!serviceCategory || !description) throw badRequest('Service category and description are required');
  const latitude = body.latitude || body.customer_latitude || null;
  const longitude = body.longitude || body.customer_longitude || null;
  const result = await query(
    `insert into jobs (customer_id, service_category, description, location_name, customer_latitude,
      customer_longitude, status, urgency, estimated_price)
     values ($1, $2, $3, $4, $5, $6, 'matching', $7, $8) returning *`,
    [
      req.user.id,
      serviceCategory,
      description,
      body.locationName || body.location_name || body.address || '',
      latitude,
      longitude,
      body.urgency || 'normal',
      body.estimatedPrice || body.estimated_price || null,
    ],
  );
  const job = result.rows[0];
  await query(
    `insert into job_status_updates (job_id, status, actor_id, note) values ($1, 'matching', $2, 'Job created')`,
    [job.id, req.user.id],
  );
  emitEvent('job:created', { jobId: job.id, status: 'matching' }, `job:${job.id}`);
  const candidates = await findNearestFundis(latitude, longitude, serviceCategory);
  if (!candidates.length) {
    emitEvent('job:search:failed', { jobId: job.id, reason: 'No online fundis available' }, `job:${job.id}`);
    return res.status(201).json({ success: true, job: publicJob(job), matching: { candidates: [], failed: true } });
  }
  emitEvent('job:created', { jobId: job.id, job: publicJob(job), candidates });
  res.status(201).json({ success: true, job: publicJob(job), matching: { candidates, failed: false } });
}

export async function uploadJobPhotos(req, res) {
  const job = await loadJob(req.params.id);
  requireJobAccess(req.user, job);
  const photos = (req.files || []).map((file) => ({
    url: `/uploads/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  }));
  res.status(201).json({ success: true, photos });
}

export async function listJobs(req, res) {
  const column = req.user.role === 'fundi' ? 'fundi_id' : 'customer_id';
  const result = await query(`select * from jobs where ${column} = $1 order by created_at desc`, [req.user.id]);
  res.json({ success: true, jobs: result.rows.map(publicJob) });
}

export async function getJob(req, res) {
  const job = await loadJob(req.params.id);
  requireJobAccess(req.user, job);
  res.json({ success: true, job: publicJob(job) });
}

export async function getJobStatus(req, res) {
  const job = await loadJob(req.params.id);
  requireJobAccess(req.user, job);
  res.json({ success: true, status: job.status, updatedAt: job.updated_at, job: publicJob(job) });
}

export async function patchJob(req, res) {
  const { status } = req.body || {};
  if (!status) throw badRequest('Status is required');
  const allowedStatuses = ['pending', 'matching', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'failed'];
  if (!allowedStatuses.includes(status)) throw badRequest('Invalid job status');
  const job = await loadJob(req.params.id);
  requireJobAccess(req.user, job);
  if (req.user.role !== 'admin') {
    if (['on_the_way', 'arrived', 'in_progress', 'completed'].includes(status)) requireAssignedFundi(req.user, job);
    if (['cancelled'].includes(status)) requireCustomer(req.user, job);
  }
  const result = await query('update jobs set status = $2, updated_at = now() where id = $1 returning *', [req.params.id, status]);
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
  const result = await query(
    `update jobs set fundi_id = $2, status = 'accepted', estimated_price = coalesce($3, estimated_price), updated_at = now()
     where id = $1 and status in ('pending', 'matching') returning *`,
    [req.params.id, req.user.id, req.body?.estimatedPrice || null],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be accepted');
  emitEvent('job:accepted', { jobId: req.params.id, fundiId: req.user.id, status: 'accepted', job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  emitEvent('fundi:response:ok', { accepted: true, jobId: req.params.id }, `user:${req.user.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function cancelJob(req, res) {
  const job = await loadJob(req.params.id);
  requireJobAccess(req.user, job);
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
  if (!['in_progress', 'arrived'].includes(job.status)) throw badRequest('Job must be in progress before completion');
  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);
  const result = await query(
    `update jobs set status = 'completed', completion_otp_hash = $2,
      final_price = coalesce($3, final_price, estimated_price), updated_at = now()
     where id = $1 returning *`,
    [req.params.id, otpHash, req.body?.finalPrice || null],
  );
  emitEvent('job:completed', { jobId: req.params.id }, `job:${req.params.id}`);
  emitEvent('job:status', { jobId: req.params.id, status: 'completed', job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]), completionOtpIssued: true });
}

export async function confirmCompletion(req, res) {
  const { otp } = req.body || {};
  if (!otp) throw badRequest('OTP is required');
  const existing = await query('select id, customer_id, completion_otp_hash from jobs where id = $1', [req.params.id]);
  const job = existing.rows[0];
  if (!job) throw notFound('Job not found');
  requireCustomer(req.user, job);
  if (!job?.completion_otp_hash || !(await bcrypt.compare(String(otp), job.completion_otp_hash))) {
    throw forbidden('Invalid completion OTP');
  }
  const result = await query(
    `update jobs set customer_completion_confirmed = true, payment_status = 'customer_confirmed',
      escrow_status = 'completion_requested', updated_at = now()
     where id = $1 returning *`,
    [req.params.id],
  );
  emitEvent('job:completion:confirmed', { jobId: req.params.id, job: publicJob(result.rows[0]) }, `job:${req.params.id}`);
  res.json({ success: true, job: publicJob(result.rows[0]) });
}

export async function activeFundiJob(req, res) {
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
  res.json({ success: true, job: publicJob(matches[0]) });
}

export async function submitReview(req, res) {
  const { jobId = req.params.id, rating, comment = '' } = req.body || {};
  if (!jobId || !rating) throw badRequest('Job and rating are required');
  const job = await loadJob(jobId);
  requireCustomer(req.user, job);
  if (job.status !== 'completed' || !job.customer_completion_confirmed) {
    throw badRequest('Only completed jobs can be reviewed');
  }
  const result = await query(
    `insert into reviews (job_id, reviewer_id, rating, comment)
     values ($1, $2, $3, $4) returning *`,
    [jobId, req.user.id, rating, comment],
  );
  emitEvent('review:submitted', { jobId, reviewId: result.rows[0].id }, `job:${jobId}`);
  emitEvent('trust:updated', { userId: job.fundi_id, jobId }, `user:${job.fundi_id}`);
  res.status(201).json({ success: true, review: result.rows[0] });
}
