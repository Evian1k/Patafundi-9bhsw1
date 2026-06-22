/**
 * RBAC controller — role/permission management for enterprise staff.
 *
 * All endpoints require super_admin (or a user with can_manage_roles /
 * can_promote_users permission). See routes.js for the route bindings.
 */
import { query } from '../db.js';
import { badRequest, notFound, forbidden } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { listUserPermissions, isStaffRole } from '../middleware/rbac.js';

const VALID_STAFF_ROLES = [
  'super_admin', 'admin', 'support_agent', 'fraud_analyst',
  'finance_team', 'dispatch_team', 'devops_engineer', 'auditor',
];

/** GET /staff/me/permissions — any staff member can list their own permissions. */
export async function listMyPermissions(req, res) {
  // Non-staff users get an empty list (they have no staff permissions).
  if (!isStaffRole(req.user.role)) {
    return res.json({ success: true, role: req.user.role, permissions: [] });
  }
  const perms = await listUserPermissions(req.user.id, req.user.role);
  res.json({ success: true, role: req.user.role, permissions: perms });
}

/** GET /admin/roles — list all staff roles + their permission counts. */
export async function listRoles(_req, res) {
  const result = await query(
    `select r.role, count(r.permission_code)::int as permission_count,
            (select count(*) from users u where u.role = r.role)::int as user_count
     from role_permissions r
     group by r.role
     order by r.role`,
  );
  // Include roles with zero permissions (e.g. customer, fundi) for completeness.
  const allRoles = [...VALID_STAFF_ROLES, 'customer', 'fundi_pending', 'fundi'];
  const byRole = Object.fromEntries(result.rows.map((r) => [r.role, r]));
  const roles = allRoles.map((role) => ({
    role,
    permissionCount: byRole[role]?.permission_count || 0,
    userCount: byRole[role]?.user_count || 0,
    isStaff: VALID_STAFF_ROLES.includes(role),
  }));
  res.json({ success: true, roles });
}

/** GET /admin/roles/:role/permissions — list permissions for a role. */
export async function listRolePermissions(req, res) {
  const role = req.params.role;
  if (!VALID_STAFF_ROLES.includes(role)) {
    throw badRequest(`Unknown staff role: ${role}`);
  }
  const result = await query(
    `select p.code, p.description, p.category, p.is_dangerous
     from role_permissions rp
     join permissions p on p.code = rp.permission_code
     where rp.role = $1
     order by p.category, p.code`,
    [role],
  );
  res.json({ success: true, role, permissions: result.rows });
}

/**
 * POST /admin/users/:id/permissions — grant or deny a specific permission
 * for a user (overrides role_permissions).
 *
 * Body: { permissionCode, granted, reason }
 * granted=true → explicit grant
 * granted=false → explicit deny (overrides role grant)
 */
export async function setUserPermission(req, res) {
  const { permissionCode, granted = true, reason = null } = req.body || {};
  if (!permissionCode) throw badRequest('permissionCode is required');

  // Verify the permission exists.
  const perm = await query('select code from permissions where code = $1', [permissionCode]);
  if (!perm.rows[0]) throw notFound(`Permission not found: ${permissionCode}`);

  // Verify the target user exists.
  const user = await query('select id, role from users where id = $1', [req.params.id]);
  if (!user.rows[0]) throw notFound('User not found');

  // Safety: cannot modify permissions of a super_admin (except by another super_admin).
  if (user.rows[0].role === 'super_admin' && req.user.role !== 'super_admin') {
    throw forbidden('Cannot modify super_admin permissions');
  }

  await query(
    `insert into user_permissions (user_id, permission_code, granted, reason, granted_by)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, permission_code) do update set
       granted = excluded.granted,
       reason = excluded.reason,
       granted_by = excluded.granted_by,
       created_at = now()`,
    [req.params.id, permissionCode, Boolean(granted), reason, req.user.id],
  );

  await auditLog({
    userId: req.user.id,
    action: 'rbac.set_permission',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { permissionCode, granted: Boolean(granted), reason },
  });

  res.json({ success: true, message: `Permission ${permissionCode} ${granted ? 'granted' : 'denied'}` });
}

/** DELETE /admin/users/:id/permissions/:code — remove a user-level override. */
export async function removeUserPermission(req, res) {
  const result = await query(
    `delete from user_permissions where user_id = $1 and permission_code = $2 returning *`,
    [req.params.id, req.params.code],
  );
  if (!result.rows[0]) throw notFound('Override not found');

  await auditLog({
    userId: req.user.id,
    action: 'rbac.remove_permission',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { permissionCode: req.params.code },
  });

  res.json({ success: true, message: 'Override removed' });
}

/**
 * POST /admin/users/:id/role — change a user's role.
 *
 * Body: { role }
 * Only super_admin (or a user with can_promote_users) can change roles.
 * Cannot promote to super_admin (only the seeded owner holds that role).
 */
export async function setUserRole(req, res) {
  const { role } = req.body || {};
  if (!role) throw badRequest('role is required');
  if (!VALID_STAFF_ROLES.includes(role)) {
    throw badRequest(`Invalid staff role: ${role}. Valid: ${VALID_STAFF_ROLES.join(', ')}`);
  }

  // Guard: super_admin role cannot be assigned via API.
  if (role === 'super_admin') {
    throw forbidden('super_admin role cannot be assigned via API. It is reserved for the platform owner.');
  }

  const target = await query('select id, role, email from users where id = $1', [req.params.id]);
  if (!target.rows[0]) throw notFound('User not found');

  // Cannot demote a super_admin via API.
  if (target.rows[0].role === 'super_admin') {
    throw forbidden('Cannot change super_admin role via API');
  }

  await query('update users set role = $2, updated_at = now() where id = $1', [req.params.id, role]);

  // Revoke active sessions so the user must re-authenticate with their new role.
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.params.id]);

  await auditLog({
    userId: req.user.id,
    action: 'rbac.set_role',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { previousRole: target.rows[0].role, newRole: role, targetEmail: target.rows[0].email },
  });

  res.json({ success: true, message: `Role changed to ${role}`, previousRole: target.rows[0].role });
}

/**
 * POST /admin/staff — create a new staff account.
 * Super_admin only (can_create_staff permission).
 * Body: { email, password, fullName, phone, role }
 * Role must be a staff role (not super_admin, not customer, not fundi).
 */
export async function createStaff(req, res) {
  const { email, password, fullName, phone, role } = req.body || {};
  if (!email || !password || !fullName || !role) {
    throw badRequest('email, password, fullName, and role are required');
  }
  if (!VALID_STAFF_ROLES.includes(role)) {
    throw badRequest(`Invalid staff role: ${role}. Valid: ${VALID_STAFF_ROLES.join(', ')}`);
  }
  if (role === 'super_admin') {
    throw forbidden('super_admin role cannot be created via API');
  }

  const bcrypt = (await import('bcryptjs')).default;
  const crypto = await import('node:crypto');

  // Check if email already exists
  const existing = await query('select id from users where lower(email) = lower($1)', [email]);
  if (existing.rows[0]) throw badRequest('Email is already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const otpCode = String(crypto.randomInt(100000, 999999));

  const result = await query(
    `insert into users (email, password_hash, full_name, phone, role, status, email_verified_at)
     values (lower($1), $2, $3, $4, $5, 'active', now())
     returning id, email, full_name, phone, role, status`,
    [email, passwordHash, fullName, phone || null, role],
  );
  const user = result.rows[0];

  // Initialize trust + fraud scores
  await query(`insert into trust_scores (user_id, score, level) values ($1, 100, 'standard') on conflict do nothing`, [user.id]);
  await query(`insert into user_fraud_scores (user_id, fraud_score, risk_level) values ($1, 0, 'low') on conflict do nothing`, [user.id]);

  await auditLog({
    userId: req.user.id,
    action: 'staff.create',
    entityType: 'user',
    entityId: user.id,
    metadata: { email, role, fullName },
  });

  res.status(201).json({ success: true, user, message: `Staff account created with role: ${role}` });
}

/**
 * POST /admin/staff/:id/suspend — suspend a staff account.
 * Super_admin only (can_suspend_staff permission).
 * Cannot suspend super_admin accounts.
 */
export async function suspendStaff(req, res) {
  const { reason } = req.body || {};
  const target = await query('select id, role, email, status from users where id = $1', [req.params.id]);
  if (!target.rows[0]) throw notFound('User not found');
  if (target.rows[0].role === 'super_admin') {
    throw forbidden('Cannot suspend super_admin account');
  }
  if (!isStaffRole(target.rows[0].role)) {
    throw forbidden('Can only suspend staff accounts');
  }

  await query('update users set status = $2, updated_at = now() where id = $1', [req.params.id, 'suspended']);

  // Revoke all active sessions
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.params.id]);

  await auditLog({
    userId: req.user.id,
    action: 'staff.suspend',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { reason, email: target.rows[0].email, role: target.rows[0].role },
  });

  res.json({ success: true, message: `Staff account suspended: ${target.rows[0].email}` });
}

/**
 * POST /admin/staff/:id/ reinstate — reinstate a suspended staff account.
 * Super_admin only.
 */
export async function reinstateStaff(req, res) {
  const target = await query('select id, role, email, status from users where id = $1', [req.params.id]);
  if (!target.rows[0]) throw notFound('User not found');

  await query('update users set status = $2, updated_at = now() where id = $1', [req.params.id, 'active']);

  await auditLog({
    userId: req.user.id,
    action: 'staff.reinstate',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { email: target.rows[0].email, role: target.rows[0].role },
  });

  res.json({ success: true, message: `Staff account reinstated: ${target.rows[0].email}` });
}

/**
 * POST /admin/users/:id/ban — permanently ban a user.
 * Super_admin only (can_ban_permanently permission).
 * Cannot ban super_admin accounts.
 */
export async function banUserPermanently(req, res) {
  const { reason } = req.body || {};
  const target = await query('select id, role, email, status from users where id = $1', [req.params.id]);
  if (!target.rows[0]) throw notFound('User not found');
  if (target.rows[0].role === 'super_admin') {
    throw forbidden('Cannot ban super_admin account');
  }

  await query('update users set status = $2, updated_at = now() where id = $1', [req.params.id, 'banned']);

  // Revoke all sessions
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.params.id]);

  await auditLog({
    userId: req.user.id,
    action: 'user.ban_permanent',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { reason, email: target.rows[0].email, role: target.rows[0].role },
  });

  res.json({ success: true, message: `User permanently banned: ${target.rows[0].email}` });
}
