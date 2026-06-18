/**
 * Enterprise RBAC permission middleware.
 *
 * Usage:
 *   import { requirePermission } from '../middleware/rbac.js';
 *
 *   router.post('/admin/fundis/:id/approve',
 *     authRequired,
 *     requirePermission('can_approve_fundis'),
 *     asyncHandler(admin.approveFundi));
 *
 * How it works:
 *   1. authRequired sets req.user (re-fetched from DB on every request).
 *   2. requirePermission(code) checks:
 *      a. user_permissions override (explicit grant or deny) — takes precedence
 *      b. role_permissions mapping for the user's current role
 *   3. If neither grants the permission, returns 403.
 *
 * Security notes:
 *   - Role is read from req.user.role (DB, not JWT) — JWT tampering cannot
 *     grant permissions.
 *   - user_permissions with granted=false explicitly DENIES a permission
 *     even if the role would normally have it. This allows scoped revocation
 *     without changing the user's role.
 *   - The permission check is cached per-request (not across requests) to
 *     ensure changes to role_permissions take effect immediately.
 */

import { query } from '../db.js';
import { forbidden } from '../utils/http.js';

// In-process cache per request — avoids re-querying permissions when
// multiple middleware run on the same request.
const REQUEST_CACHE = new WeakMap();

async function loadUserPermissions(userId, role) {
  // Check the per-request cache first.
  // (Caller must pass req as the cache key — see hasPermission below.)
  const [explicit, rolePerms] = await Promise.all([
    query(
      `select permission_code, granted from user_permissions where user_id = $1`,
      [userId],
    ),
    query(
      `select permission_code from role_permissions where role = $1`,
      [role],
    ),
  ]);

  const denied = new Set();
  const granted = new Set();
  for (const row of explicit.rows) {
    if (row.granted) granted.add(row.permission_code);
    else denied.add(row.permission_code);
  }
  const roleGranted = new Set(rolePerms.rows.map((r) => r.permission_code));

  return { denied, granted, roleGranted };
}

/**
 * Returns true if the user has the given permission.
 * Exported for controllers that need to check permissions inline.
 */
export async function hasPermission(req, code) {
  if (!req.user) return false;

  // Super_admin bypass — always allowed.
  if (req.user.role === 'super_admin') return true;

  let perms = REQUEST_CACHE.get(req);
  if (!perms) {
    perms = await loadUserPermissions(req.user.id, req.user.role);
    REQUEST_CACHE.set(req, perms);
  }

  // Explicit deny overrides everything.
  if (perms.denied.has(code)) return false;
  // Explicit grant overrides role.
  if (perms.granted.has(code)) return true;
  // Role-based grant.
  return perms.roleGranted.has(code);
}

/**
 * Express middleware factory.
 *   requirePermission('can_approve_fundis')
 * Returns 403 if the user lacks the permission.
 */
export function requirePermission(code) {
  return async (req, _res, next) => {
    try {
      const allowed = await hasPermission(req, code);
      if (!allowed) {
        return next(forbidden(`Missing required permission: ${code}`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require ANY of the listed permissions.
 *   requireAnyPermission('can_view_payments', 'can_view_commissions')
 */
export function requireAnyPermission(...codes) {
  return async (req, _res, next) => {
    try {
      for (const code of codes) {
        if (await hasPermission(req, code)) return next();
      }
      return next(forbidden(`Missing any of: ${codes.join(', ')}`));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require ALL of the listed permissions.
 *   requireAllPermissions('can_view_fundis', 'can_approve_fundis')
 */
export function requireAllPermissions(...codes) {
  return async (req, _res, next) => {
    try {
      for (const code of codes) {
        if (!(await hasPermission(req, code))) {
          return next(forbidden(`Missing required permission: ${code}`));
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Backward compatibility: any staff role (not customer/fundi/fundi_pending)
 * passes. Used for routes that were previously protected by requireRole('admin')
 * but should now be open to any staff member with the relevant permission.
 *
 * NOTE: This is a transition helper. New code should use requirePermission()
 * with a specific permission code.
 */
const STAFF_ROLES = new Set([
  'super_admin', 'admin', 'support_agent', 'fraud_analyst',
  'finance_team', 'dispatch_team', 'devops_engineer', 'auditor',
]);

export function requireStaff() {
  return (req, _res, next) => {
    if (!req.user || !STAFF_ROLES.has(req.user.role)) {
      return next(forbidden('Staff access required'));
    }
    next();
  };
}

/**
 * Check if a role is a staff role (not customer/fundi).
 */
export function isStaffRole(role) {
  return STAFF_ROLES.has(role);
}

/**
 * List all permissions for a user (role + overrides).
 * Used by the frontend to show/hide UI elements.
 */
export async function listUserPermissions(userId, role) {
  const perms = await loadUserPermissions(userId, role);
  const result = new Set();
  // Start with role permissions.
  for (const code of perms.roleGranted) result.add(code);
  // Apply explicit grants.
  for (const code of perms.granted) result.add(code);
  // Remove explicit denies.
  for (const code of perms.denied) result.delete(code);
  return [...result].sort();
}
