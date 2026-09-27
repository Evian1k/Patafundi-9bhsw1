/**
 * Platform owner bootstrap (spec §3 / §39).
 *
 * Shared logic used by BOTH:
 *   - backend/scripts/bootstrap-owner.js (manual CLI bootstrap)
 *   - server/db boot when OWNER_PASSWORD is present in the environment
 *     (see maybeBootstrapOwnerFromEnv) — so setting OWNER_PASSWORD on Render
 *     is enough: the owner account is created automatically on the next boot.
 *
 * Guarantees:
 *   - Fixed owner email (spec §3): emmanuelevian@gmail.com — this email is on
 *     the server-side Super Admin allowlist (adminAllowlist.js).
 *   - Idempotent: an existing owner is NEVER overwritten. If the role drifted,
 *     it is healed back to super_admin. Password changes made later in-app
 *     survive reboots even if OWNER_PASSWORD stays in the environment.
 *   - Fail-closed on password quality: minimum length enforced, password never
 *     logged (print paths are CLI-only and opt-in).
 */
import bcrypt from 'bcryptjs';

export const OWNER_EMAIL = 'emmanuelevian@gmail.com';
export const OWNER_FULL_NAME = 'Emmanuel Evian';
export const MIN_OWNER_PASSWORD_LENGTH = 10;

/**
 * Create or heal the platform owner account.
 *
 * @param {object} pool - pg Pool / PGlite db exposing `.query(sql, params)`
 * @param {object} options
 * @param {string} options.password - plaintext owner password (from env, never committed)
 * @param {string} [options.email]
 * @param {string} [options.fullName]
 * @param {function} [options.log]
 * @returns {Promise<{created: boolean, healed: boolean, existingRole?: string}>}
 */
export async function ensureOwnerAccount(pool, {
  password,
  email = OWNER_EMAIL,
  fullName = OWNER_FULL_NAME,
  log = console.log,
} = {}) {
  if (!password || typeof password !== 'string') {
    throw new Error('owner bootstrap: password is required (set OWNER_PASSWORD)');
  }
  if (password.length < MIN_OWNER_PASSWORD_LENGTH) {
    throw new Error(`owner bootstrap: password must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters`);
  }

  const existing = await pool.query(
    'select id, role from users where lower(email) = lower($1)',
    [email],
  );

  if (existing.rows[0]) {
    const role = existing.rows[0].role;
    if (role !== 'super_admin') {
      // The spec names this account as THE owner — heal the role if it drifted.
      await pool.query(`update users set role = 'super_admin', status = 'active' where id = $1`, [existing.rows[0].id]);
      log(`[owner-bootstrap] ${email} existed as "${role}" — elevated to super_admin`);
      return { created: false, healed: true, existingRole: role };
    }
    log(`[owner-bootstrap] ${email} already exists as super_admin — nothing to do (password untouched)`);
    return { created: false, healed: false, existingRole: role };
  }

  const hash = await bcrypt.hash(password, 12);
  const inserted = await pool.query(
    `insert into users (email, password_hash, full_name, role, status, email_verified_at)
     values (lower($1), $2, $3, 'super_admin', 'active', now())
     returning id`,
    [email, hash, fullName],
  );
  await pool.query(
    `insert into trust_scores (user_id, score, level) values ($1, 100, 'trusted') on conflict (user_id) do nothing`,
    [inserted.rows[0].id],
  );
  log(`[owner-bootstrap] owner account created: ${email} (super_admin)`);
  return { created: true, healed: false };
}

/**
 * Boot-time owner bootstrap — runs when OWNER_PASSWORD is set.
 * NEVER throws: a failure here must not take the whole DB bootstrap down;
 * the next boot retries automatically.
 *
 * @param {object} pool - pg Pool / PGlite db exposing `.query(sql, params)`
 * @param {object} [loggers] - { log, warn } sinks (injectable for tests)
 */
export async function maybeBootstrapOwnerFromEnv(pool, loggers = {}) {
  const log = loggers.log ?? console.log;
  const warn = loggers.warn ?? console.warn;

  const password = process.env.OWNER_PASSWORD;
  if (!password) return { skipped: true, reason: 'OWNER_PASSWORD not set' };

  try {
    const result = await ensureOwnerAccount(pool, { password, log });
    if (result.created) {
      log('[owner-bootstrap] set via OWNER_PASSWORD environment variable — change the password in-app and remove the env var when done');
    }
    return { skipped: false, ...result };
  } catch (error) {
    warn(`[owner-bootstrap] skipped: ${error.message}`);
    return { skipped: false, error: error.message };
  }
}
