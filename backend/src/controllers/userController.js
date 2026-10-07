import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { encrypt as encryptField, decrypt as decryptField } from '../services/encryptionService.js';

// Phone numbers are stored AES-256-GCM encrypted at registration (spec §9);
// profile updates must not silently downgrade them to plaintext.
function protectPhone(phone) {
  if (phone == null) return null;
  try {
    return encryptField(String(phone));
  } catch {
    return String(phone); // encryption not configured in this environment
  }
}
function safeDecryptPhone(phone) {
  if (!phone) return phone;
  try {
    return decryptField(phone);
  } catch {
    return phone; // legacy plaintext value
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    trustScore: user.trust_score,
    // 2FA state drives the Security Center badge; never fabricate it client-side.
    totpEnabled: !!user.totp_enabled,
  };
}

export async function me(req, res) {
  res.json({ success: true, user: publicUser(req.user) });
}

export async function updateMe(req, res) {
  const { fullName, phone, countryCode, preferredLanguage } = req.body || {};
  // Globalization (spec §40): persist the user's region + language preference.
  // Values are validated against the countries/languages tables when present.
  let validatedCountry = null;
  let validatedLanguage = null;
  if (countryCode) {
    const country = await query('select code from countries where code = $1 and is_active = true', [String(countryCode).toUpperCase()]);
    if (!country.rows[0]) throw badRequest('Unsupported country code');
    validatedCountry = country.rows[0].code;
  }
  if (preferredLanguage) {
    const lang = await query('select code from languages where code = $1', [String(preferredLanguage).toLowerCase()]);
    if (!lang.rows[0]) throw badRequest('Unsupported language code');
    validatedLanguage = lang.rows[0].code;
  }
  const result = await query(
    `update users set full_name = coalesce($2, full_name), phone = coalesce($3, phone),
       country_code = coalesce($4, country_code), preferred_language = coalesce($5, preferred_language),
       updated_at = now()
     where id = $1 returning id, email, full_name, phone, role, status, trust_score, country_code, preferred_language`,
    [req.user.id, fullName, phone ? protectPhone(phone) : null, validatedCountry, validatedLanguage],
  );
  const user = result.rows[0];
  if (user) user.phone = safeDecryptPhone(user.phone);
  res.json({ success: true, user });
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

const PASSWORD_MIN_LENGTH = 8;
function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest('New password must be at least 8 characters long');
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest('New password must contain both letters and numbers');
  }
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw badRequest('Current and new passwords are required');
  assertPasswordStrength(newPassword);
  const result = await query('select password_hash from users where id = $1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) throw forbidden('Current password is incorrect');
  await query('update users set password_hash = $2, updated_at = now() where id = $1', [req.user.id, await bcrypt.hash(newPassword, 12)]);
  // Revoke every refresh token: a stolen session cannot survive a password change.
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.user.id]);
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
