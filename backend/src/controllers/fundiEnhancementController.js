/**
 * Fundi Enhancement Controller — portfolio, SOS, availability, earnings analytics.
 */
import { query } from '../db.js';
import { badRequest, notFound, forbidden } from '../utils/http.js';
import { uploadPrivateFile } from '../services/storageService.js';
import { mapMulterFile } from '../middleware/upload.js';
import { auditLog } from '../services/auditService.js';
import { emitEvent } from '../realtime.js';

// ============================================================
// PORTFOLIO
// ============================================================
export async function listPortfolio(req, res) {
  const fundiId = req.params.fundiId;
  const result = await query(
    `select id, title, description, service_category, sort_order, created_at
     from fundi_portfolios
     where fundi_id = $1 and status = 'active'
     order by sort_order, created_at desc`,
    [fundiId],
  );
  res.json({ success: true, portfolio: result.rows });
}

export async function uploadPortfolioItem(req, res) {
  const file = mapMulterFile(req.file);
  if (!file) throw badRequest('Image is required');
  const { title = null, description = null, serviceCategory = null } = req.body || {};

  // Get fundi_id from the authenticated user
  const fundi = await query('select id from fundis where user_id = $1', [req.user.id]);
  if (!fundi.rows[0]) throw notFound('Fundi profile not found');

  const uploaded = await uploadPrivateFile({
    folder: `portfolio/${fundi.rows[0].id}`,
    file,
  });

  const result = await query(
    `insert into fundi_portfolios (fundi_id, user_id, r2_key, thumb_r2_key, title, description, service_category)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [fundi.rows[0].id, req.user.id, uploaded.r2Key, uploaded.thumbR2Key, title, description, serviceCategory],
  );

  await auditLog({ userId: req.user.id, action: 'portfolio.upload', entityType: 'fundi_portfolio', entityId: result.rows[0].id });
  res.status(201).json({ success: true, item: result.rows[0] });
}

export async function deletePortfolioItem(req, res) {
  const result = await query(
    `update fundi_portfolios set status = 'deleted' where id = $1 and user_id = $2 returning *`,
    [req.params.id, req.user.id],
  );
  if (!result.rows[0]) throw notFound('Portfolio item not found');
  res.json({ success: true });
}

// ============================================================
// SOS EMERGENCY
// ============================================================
export async function triggerSOS(req, res) {
  const { latitude, longitude, message = '', jobId = null } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Location is required');

  const role = req.user.role === 'fundi' ? 'fundi' : 'customer';

  const result = await query(
    `insert into sos_emergencies (user_id, role, job_id, latitude, longitude, message)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [req.user.id, role, jobId, latitude, longitude, message],
  );

  // Notify all admins
  const admins = await query(`select id from users where role in ('super_admin', 'admin') and status = 'active'`);
  for (const admin of admins.rows) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'sos_emergency', '🚨 SOS Emergency', $2, $3::jsonb)`,
      [admin.id, `${role} ${req.user.email} triggered SOS: ${message || 'No message'}`, JSON.stringify({ sosId: result.rows[0].id, userId: req.user.id, latitude, longitude })],
    );
    emitEvent('sos:emergency', { sosId: result.rows[0].id, userId: req.user.id, role, latitude, longitude, message }, `user:${admin.id}`);
  }

  await auditLog({ userId: req.user.id, action: 'sos.trigger', entityType: 'sos_emergency', entityId: result.rows[0].id, metadata: { latitude, longitude, message } });
  res.status(201).json({ success: true, sos: result.rows[0], message: 'Emergency alert sent to all staff. Help is on the way.' });
}

export async function listSOS(req, res) {
  const result = await query(
    `select s.*, u.full_name, u.email, u.phone
     from sos_emergencies s join users u on u.id = s.user_id
     where s.status = 'active'
     order by s.created_at desc limit 50`,
  );
  res.json({ success: true, emergencies: result.rows });
}

export async function resolveSOS(req, res) {
  const { resolutionNote = '' } = req.body || {};
  const result = await query(
    `update sos_emergencies set status = 'resolved', responded_by = $2, responded_at = now(), resolution_note = $3
     where id = $1 returning *`,
    [req.params.id, req.user.id, resolutionNote],
  );
  if (!result.rows[0]) throw notFound('SOS not found');
  await auditLog({ userId: req.user.id, action: 'sos.resolve', entityType: 'sos_emergency', entityId: req.params.id, metadata: { resolutionNote } });
  res.json({ success: true, sos: result.rows[0] });
}

// ============================================================
// AVAILABILITY SCHEDULE
// ============================================================
export async function getAvailability(req, res) {
  const fundi = await query('select id from fundis where user_id = $1', [req.user.id]);
  if (!fundi.rows[0]) throw notFound('Fundi profile not found');
  const result = await query(
    `select * from fundi_availability where fundi_id = $1 order by day_of_week`,
    [fundi.rows[0].id],
  );
  res.json({ success: true, schedule: result.rows });
}

export async function updateAvailability(req, res) {
  const { schedule } = req.body || {};
  if (!Array.isArray(schedule)) throw badRequest('schedule array required');

  const fundi = await query('select id from fundis where user_id = $1', [req.user.id]);
  if (!fundi.rows[0]) throw notFound('Fundi profile not found');
  const fundiId = fundi.rows[0].id;

  await query('delete from fundi_availability where fundi_id = $1', [fundiId]);
  for (const slot of schedule) {
    if (slot.day_of_week == null || slot.start_hour == null || slot.end_hour == null) continue;
    await query(
      `insert into fundi_availability (fundi_id, day_of_week, start_hour, end_hour, is_available)
       values ($1, $2, $3, $4, $5)
       on conflict (fundi_id, day_of_week) do update set
         start_hour = excluded.start_hour,
         end_hour = excluded.end_hour,
         is_available = excluded.is_available,
         updated_at = now()`,
      [fundiId, slot.day_of_week, slot.start_hour, slot.end_hour, slot.is_available !== false],
    );
  }
  res.json({ success: true, message: 'Availability updated' });
}

// ============================================================
// EARNINGS ANALYTICS
// ============================================================
export async function earningsAnalytics(req, res) {
  const [daily, weekly, monthly, byCategory, recentPayouts] = await Promise.all([
    query(
      `select coalesce(sum(et.amount), 0)::numeric as total,
              count(*)::int as count
       from escrow_transactions et
       join jobs j on j.id = et.job_id
       where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
         and et.created_at > now() - interval '1 day'`,
      [req.user.id],
    ),
    query(
      `select coalesce(sum(et.amount), 0)::numeric as total,
              count(*)::int as count
       from escrow_transactions et
       join jobs j on j.id = et.job_id
       where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
         and et.created_at > now() - interval '7 days'`,
      [req.user.id],
    ),
    query(
      `select coalesce(sum(et.amount), 0)::numeric as total,
              count(*)::int as count
       from escrow_transactions et
       join jobs j on j.id = et.job_id
       where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
         and et.created_at > now() - interval '30 days'`,
      [req.user.id],
    ),
    query(
      `select j.service_category,
              count(*)::int as jobs,
              coalesce(sum(et.amount), 0)::numeric as earnings
       from escrow_transactions et
       join jobs j on j.id = et.job_id
       where j.fundi_id = $1 and et.type = 'release' and et.status = 'released'
         and et.created_at > now() - interval '90 days'
       group by j.service_category order by earnings desc`,
      [req.user.id],
    ),
    query(
      `select id, amount, status, created_at, updated_at
       from payouts where fundi_id = $1
       order by created_at desc limit 10`,
      [req.user.id],
    ),
  ]);

  res.json({
    success: true,
    analytics: {
      today: { earnings: Number(daily.rows[0]?.total || 0), jobs: daily.rows[0]?.count || 0 },
      thisWeek: { earnings: Number(weekly.rows[0]?.total || 0), jobs: weekly.rows[0]?.count || 0 },
      thisMonth: { earnings: Number(monthly.rows[0]?.total || 0), jobs: monthly.rows[0]?.count || 0 },
      byCategory: byCategory.rows.map((r) => ({ category: r.service_category, jobs: r.jobs, earnings: Number(r.earnings) })),
      recentPayouts: recentPayouts.rows,
    },
  });
}
