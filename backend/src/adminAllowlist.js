/**
 * Super Admin allowlist (spec §39 — Admin Access).
 *
 * The platform owner account is authorized by EMAIL, server-side.
 * No public "Admin Login" button exists; role is granted to the seeded
 * owner account, and this allowlist is the second gate: any account whose
 * email is not on the list can never exercise super_admin privileges,
 * even if the role column were tampered with directly in the database.
 *
 * Configuration:
 *   SUPER_ADMIN_EMAILS — comma-separated list (env var on Render).
 *   Defaults to the platform owner (emmanuelevian@gmail.com) plus the
 *   shipped demo owner account. In production set SUPER_ADMIN_EMAILS to
 *   only the real owner email to lock the platform down completely.
 *
 * Enforcement points:
 *   1. middleware/auth.js  — demotes any non-allowlisted super_admin back to
 *      'admin' on their first authenticated request (fail-closed), revokes
 *      their sessions, and writes a security audit event. authRequired runs
 *      before every permission check, so this is the single authoritative gate.
 *   2. rbacController      — the API refuses to assign super_admin via any
 *      route; the role can only exist by direct DB seeding.
 */

const DEFAULT_SUPER_ADMINS = [
  'emmanuelevian@gmail.com', // platform owner (spec §39)
];

// The demo owner account is a DEV convenience only. It must never grant
// super_admin privileges if production is misconfigured (spec §3: zero demo
// accounts in production). parseAllowlist filters it out outside development.
const DEV_ONLY_SUPER_ADMINS = [
  'admin.demo@patafundi.test',
];

function parseAllowlist() {
  const raw = process.env.SUPER_ADMIN_EMAILS || '';
  const entries = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length > 0) return entries;
  if (process.env.NODE_ENV === 'production') return DEFAULT_SUPER_ADMINS;
  return [...DEFAULT_SUPER_ADMINS, ...DEV_ONLY_SUPER_ADMINS];
}

/** Case-insensitive check against the configured allowlist. */
export function isSuperAdminEmail(email) {
  if (!email) return false;
  return parseAllowlist().includes(String(email).toLowerCase());
}

/** The allowlist itself — used for auditing and admin UI display. */
export function superAdminEmails() {
  return parseAllowlist();
}
