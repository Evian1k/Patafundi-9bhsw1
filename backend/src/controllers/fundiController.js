import { query } from '../db.js';
import { badRequest } from '../utils/http.js';

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
  const result = await query(
    `select f.id, f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score,
      null::numeric as latitude, null::numeric as longitude
     from fundis f join users u on u.id = f.user_id
     where f.approval_status = 'approved'
     order by f.rating desc limit 25`,
  );
  res.json({ success: true, fundis: result.rows });
}

export async function dashboard(req, res) {
  const [jobs, fundi] = await Promise.all([
    query(`select * from jobs where fundi_id = $1 order by updated_at desc limit 10`, [req.user.id]),
    query(`select * from fundis where user_id = $1`, [req.user.id]),
  ]);
  res.json({ success: true, dashboard: { jobs: jobs.rows, fundi: fundi.rows[0] || null } });
}

export async function status(req, res) {
  const result = await query('select online, latitude, longitude from fundis where user_id = $1', [req.user.id]);
  res.json({ success: true, status: result.rows[0] || { online: false } });
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
  return goOnline(req, res);
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
