import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';

export async function me(req, res) {
  res.json({ success: true, user: req.user });
}

export async function updateMe(req, res) {
  const { fullName, phone } = req.body || {};
  const result = await query(
    `update users set full_name = coalesce($2, full_name), phone = coalesce($3, phone), updated_at = now()
     where id = $1 returning id, email, full_name, phone, role, status, trust_score`,
    [req.user.id, fullName, phone],
  );
  res.json({ success: true, user: result.rows[0] });
}

export async function settings(req, res) {
  const result = await query('select settings from users where id = $1', [req.user.id]);
  res.json({ success: true, settings: result.rows[0]?.settings || {} });
}

export async function updateSettings(req, res) {
  const result = await query(
    `update users set settings = coalesce(settings, '{}'::jsonb) || $2::jsonb, updated_at = now()
     where id = $1 returning settings`,
    [req.user.id, JSON.stringify(req.body || {})],
  );
  res.json({ success: true, settings: result.rows[0]?.settings || {} });
}

export async function savedPlaces(req, res) {
  const result = await query('select * from saved_places where user_id = $1 order by created_at desc', [req.user.id]);
  res.json({ success: true, places: result.rows });
}

export async function addSavedPlace(req, res) {
  const { type = 'other', address, latitude = null, longitude = null } = req.body || {};
  if (!address) throw badRequest('Address is required');
  const result = await query(
    `insert into saved_places (user_id, type, address, latitude, longitude)
     values ($1, $2, $3, $4, $5) returning *`,
    [req.user.id, type, address, latitude, longitude],
  );
  res.status(201).json({ success: true, place: result.rows[0] });
}

export async function updateSavedPlace(req, res) {
  const result = await query(
    `update saved_places set address = coalesce($3, address), latitude = coalesce($4, latitude),
     longitude = coalesce($5, longitude), updated_at = now()
     where id = $1 and user_id = $2 returning *`,
    [req.params.id, req.user.id, req.body?.address, req.body?.latitude, req.body?.longitude],
  );
  res.json({ success: true, place: result.rows[0] });
}

export async function deleteSavedPlace(req, res) {
  await query('delete from saved_places where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  res.json({ success: true });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw badRequest('Current and new passwords are required');
  const result = await query('select password_hash from users where id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) throw forbidden('Current password is incorrect');
  await query('update users set password_hash = $2, updated_at = now() where id = $1', [req.user.id, await bcrypt.hash(newPassword, 12)]);
  res.json({ success: true });
}

export async function deleteAccount(req, res) {
  await query('update users set status = $2, updated_at = now() where id = $1', [req.user.id, 'deleted']);
  res.json({ success: true });
}

export async function notifications(req, res) {
  const result = await query(
    `select * from notifications
     where user_id = $1
     order by created_at desc
     limit 100`,
    [req.user.id],
  );
  res.json({ success: true, notifications: result.rows, pagination: { page: 1, total: result.rows.length } });
}

export async function markNotificationRead(req, res) {
  const result = await query(
    `update notifications
     set read_at = coalesce(read_at, now())
     where id = $1 and user_id = $2
     returning *`,
    [req.params.id, req.user.id],
  );
  if (!result.rows[0]) throw notFound('Notification not found');
  res.json({ success: true, notification: result.rows[0] });
}

export async function markAllNotificationsRead(req, res) {
  const result = await query(
    `update notifications
     set read_at = coalesce(read_at, now())
     where user_id = $1 and read_at is null
     returning id`,
    [req.user.id],
  );
  res.json({ success: true, markedRead: result.rowCount || result.rows.length });
}
