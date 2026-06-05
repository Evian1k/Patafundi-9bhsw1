import { query, transaction } from '../db.js';
import { badRequest } from '../utils/http.js';
import { emitEvent } from '../realtime.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function registerFundi(req, res) {
  const body = req.body || {};
  const result = await query(
    `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, latitude, longitude)
     values ($1, $2, $3, $4, 'pending', $5, $6)
     on conflict (user_id) do update set skills = excluded.skills, experience = excluded.experience,
       mpesa_number = excluded.mpesa_number, updated_at = now()
     returning *`,
    [
      req.user.id,
      body.skills ? (Array.isArray(body.skills) ? body.skills : String(body.skills).split(',')) : [],
      body.experience || '',
      body.mpesaNumber || body.mpesa_number || '',
      body.latitude || null,
      body.longitude || null,
    ],
  );
  res.status(201).json({ success: true, fundi: result.rows[0] });
}

export async function profile(req, res) {
  const result = await query('select * from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, fundi: result.rows[0] || null });
}

export async function approvalStatus(req, res) {
  const result = await query('select approval_status, rejection_reason from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, fundi: result.rows[0] || { approval_status: 'not_registered' } });
}

export async function updateProfile(req, res) {
  const result = await query(
    `update fundis set bio = coalesce($2, bio), skills = coalesce($3, skills), updated_at = now()
     where user_id = $1 returning *`,
    [req.user.id, req.body?.bio || null, req.body?.skills || null],
  );
  res.json({ success: true, fundi: result.rows[0] });
}

export async function publicFundi(req, res) {
  const result = await query(
    `select f.id, f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score, f.approval_status
     from fundis f join users u on u.id = f.user_id where f.id = $1 or f.user_id = $1`,
    [req.params.id],
  );
  res.json({ success: true, fundi: result.rows[0] || null });
}

export async function searchFundis(req, res) {
  const latitude = req.query.latitude == null ? null : Number(req.query.latitude);
  const longitude = req.query.longitude == null ? null : Number(req.query.longitude);
  const skill = req.query.skill ? String(req.query.skill).toLowerCase() : null;
  const result = await query(
    `select f.id, f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
      f.latitude, f.longitude, f.location_accuracy
     from fundis f join users u on u.id = f.user_id
     where f.approval_status = 'approved' and f.online = true
     order by f.rating desc limit 25`,
  );
  const fundis = result.rows
    .filter((row) => !skill || row.skills?.map((s) => String(s).toLowerCase()).includes(skill))
    .map((row) => {
      const distanceKm = Number.isFinite(latitude) && Number.isFinite(longitude) && row.latitude != null && row.longitude != null
        ? haversineKm(latitude, longitude, Number(row.latitude), Number(row.longitude))
        : null;
      return { ...row, distanceKm };
    })
    .sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
  res.json({ success: true, fundis });
}

export async function dashboard(req, res) {
  const [jobs, fundi, wallet, ratings] = await Promise.all([
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
  ]);
  const profile = fundi.rows[0] || null;
  res.json({
    success: true,
    dashboard: {
      jobs: jobs.rows,
      fundi: profile,
      verificationStatus: profile?.approval_status || 'not_registered',
      profileCompletion: profile ? 85 : 0,
      online: Boolean(profile?.online),
      walletBalance: Number(wallet.rows[0]?.balance || 0),
      jobStats: {
        newRequests: 0,
        activeJobs: jobs.rows.filter((job) => !['completed', 'cancelled', 'failed'].includes(job.status)).length,
        completedJobs: jobs.rows.filter((job) => job.status === 'completed').length,
      },
      ratings: {
        average: Number(ratings.rows[0]?.average || 0),
        total: Number(ratings.rows[0]?.total || 0),
      },
    },
  });
}

export async function status(req, res) {
  const result = await query('select online, latitude, longitude, location_accuracy, approval_status from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, status: { ...(result.rows[0] || { online: false }), subscriptionActive: true, daysLeft: 30 } });
}

export async function goOnline(req, res) {
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
  const { latitude, longitude, accuracy = null, jobId = null } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Latitude and longitude are required');
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
  const result = await query(
    `select r.* from reviews r join jobs j on j.id = r.job_id where j.fundi_id = $1 order by r.created_at desc limit $2 offset $3`,
    [req.params.id || req.user.id, Number(req.query.limit || 10), Number(req.query.offset || 0)],
  );
  res.json({ success: true, ratings: result.rows });
}
