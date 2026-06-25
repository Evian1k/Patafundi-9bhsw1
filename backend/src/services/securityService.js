/**
 * Security Service — 2FA (TOTP), account lockout, feature flags.
 */
import crypto from 'node:crypto';
import { query } from '../db.js';
import { badRequest, forbidden } from '../utils/http.js';

// ============================================================
// 1. TOTP 2FA (uses otplib + qrcode which are in package.json)
// ============================================================
let totpLib = null;
let qrLib = null;
async function getTotpLib() {
  if (!totpLib) {
    const otplib = await import('otplib');
    // otplib v13 exports generateSecret, verify, generateURI at top level
    totpLib = {
      authenticator: {
        generateSecret: () => otplib.generateSecret(),
        keyuri: (email, issuer, secret) => otplib.generateURI({ secret, accountName: email, issuer }),
        verify: ({ token, secret }) => otplib.verify({ token, secret }),
      },
    };
  }
  return totpLib;
}
async function getQrLib() {
  if (!qrLib) {
    qrLib = await import('qrcode');
  }
  return qrLib;
}

export async function setup2FA(userId) {
  const otpLib = await getTotpLib();
  const secret = otpLib.authenticator.generateSecret();
  const user = await query('select email from users where id = $1', [userId]);
  const email = user.rows[0]?.email || 'user';
  const otpauthUrl = otpLib.authenticator.keyuri(email, 'PataFundi', secret);

  // Store secret temporarily (not enabled until verified)
  await query('update users set totp_secret = $2 where id = $1', [userId, secret]);

  const qr = await getQrLib();
  const qrCode = await qr.toDataURL(otpauthUrl);

  return { secret, qrCode, otpauthUrl };
}

export async function verify2FASetup(userId, token) {
  const otpLib = await getTotpLib();
  const user = await query('select totp_secret from users where id = $1', [userId]);
  const secret = user.rows[0]?.totp_secret;
  if (!secret) throw badRequest('2FA not set up. Call setup first.');

  const isValid = otpLib.authenticator.verify({ token: String(token), secret });
  if (!isValid) throw badRequest('Invalid verification code');

  // Generate recovery codes
  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));

  await query(
    'update users set totp_enabled = true, totp_recovery_codes = $2::jsonb where id = $1',
    [userId, JSON.stringify(recoveryCodes)],
  );

  return { recoveryCodes };
}

export async function verify2FALogin(userId, token) {
  const otpLib = await getTotpLib();
  const user = await query('select totp_secret, totp_recovery_codes from users where id = $1', [userId]);
  const secret = user.rows[0]?.totp_secret;
  const recoveryCodes = user.rows[0]?.totp_recovery_codes || [];

  if (!secret) return { valid: false, reason: '2FA not set up' };

  // Check recovery code first
  if (recoveryCodes.includes(String(token))) {
    // Remove used recovery code
    const remaining = recoveryCodes.filter((c) => c !== String(token));
    await query('update users set totp_recovery_codes = $2::jsonb where id = $1', [userId, JSON.stringify(remaining)]);
    return { valid: true, usedRecoveryCode: true };
  }

  // Check TOTP token
  const isValid = otpLib.authenticator.verify({ token: String(token), secret });
  return { valid: isValid, reason: isValid ? null : 'Invalid code' };
}

export async function disable2FA(userId) {
  await query('update users set totp_enabled = false, totp_secret = null, totp_recovery_codes = $2::jsonb where id = $1', [userId, JSON.stringify([])]);
}

export async function regenerateRecoveryCodes(userId) {
  const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  await query('update users set totp_recovery_codes = $2::jsonb where id = $1', [userId, JSON.stringify(recoveryCodes)]);
  return recoveryCodes;
}

// ============================================================
// 2. Account Lockout
// ============================================================
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export async function recordFailedLogin(email, ip) {
  const result = await query('select id, failed_login_attempts, locked_until from users where lower(email) = lower($1)', [email]);
  if (!result.rows[0]) return; // don't reveal if email exists

  const user = result.rows[0];
  const attempts = Number(user.failed_login_attempts || 0) + 1;
  const lockUntil = attempts >= MAX_FAILED_ATTEMPTS
    ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString()
    : null;

  await query(
    'update users set failed_login_attempts = $2, last_failed_login_at = now(), locked_until = coalesce($3, locked_until) where id = $1',
    [user.id, attempts, lockUntil],
  );

  return { locked: Boolean(lockUntil), attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - attempts) };
}

export async function checkAccountLock(email) {
  const result = await query('select locked_until, failed_login_attempts from users where lower(email) = lower($1)', [email]);
  if (!result.rows[0]) return { locked: false };

  const lockedUntil = result.rows[0].locked_until;
  if (lockedUntil && new Date(lockedUntil) > new Date()) {
    return { locked: true, until: lockedUntil };
  }

  // Lock expired — reset
  if (lockedUntil && new Date(lockedUntil) <= new Date()) {
    await query('update users set failed_login_attempts = 0, locked_until = null where lower(email) = lower($1)', [email]);
  }

  return { locked: false };
}

export async function recordSuccessfulLogin(userId, ip) {
  await query(
    'update users set failed_login_attempts = 0, locked_until = null, last_login_at = now(), last_login_ip = $2 where id = $1',
    [userId, ip],
  );
}

// ============================================================
// 3. Feature Flags
// ============================================================
// CRITICAL: For maintenance_mode, default to FALSE (off) when the flag
// doesn't exist or the DB query fails. Defaulting to TRUE locks everyone
// out of the platform if the DB has a connection hiccup — fail OPEN,
// not fail CLOSED.
const FLAGS_DEFAULT_OFF = new Set(['maintenance_mode']);

export async function isFeatureEnabled(key) {
  try {
    const result = await query('select is_enabled from feature_flags where key = $1', [key]);
    if (!result.rows[0]) {
      // Flag doesn't exist — use safe default
      return !FLAGS_DEFAULT_OFF.has(key);
    }
    return result.rows[0].is_enabled;
  } catch (err) {
    // DB query failed — fail OPEN (feature enabled, maintenance OFF)
    // This prevents a DB hiccup from locking everyone out of the platform
    console.warn(`[featureFlags] query failed for "${key}", defaulting to ${!FLAGS_DEFAULT_OFF.has(key)}:`, err.message);
    return !FLAGS_DEFAULT_OFF.has(key);
  }
}

export async function getAllFeatureFlags() {
  const result = await query('select * from feature_flags order by category, key');
  return result.rows;
}

export async function setFeatureFlag(key, enabled, updatedBy) {
  await query(
    'update feature_flags set is_enabled = $2, updated_by = $3, updated_at = now() where key = $1',
    [key, enabled, updatedBy],
  );
  return { key, enabled };
}
