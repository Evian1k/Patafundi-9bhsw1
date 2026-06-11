import { query } from '../db.js';
import { forbidden } from '../utils/http.js';
import { logAccessDecision } from './accessDebug.js';

/** Any fundi lifecycle role (pending review or approved). */
export function requireFundiAccount(req, res, next) {
  const allowed = new Set(['fundi', 'fundi_pending', 'admin']);
  if (!req.user || !allowed.has(req.user.role)) {
    logAccessDecision(req, 'requireFundiAccount:denied', { allowedRoles: [...allowed] }).catch(() => {});
    return next(forbidden('Fundi account required'));
  }
  logAccessDecision(req, 'requireFundiAccount:allowed').catch(() => {});
  return next();
}

/** Approved fundi operators only (plus admin). */
export async function requireApprovedFundi(req, res, next) {
  try {
    if (req.user?.role === 'admin') {
      await logAccessDecision(req, 'requireApprovedFundi:admin_bypass');
      return next();
    }
    if (req.user?.role !== 'fundi') {
      await logAccessDecision(req, 'requireApprovedFundi:role_denied', {
        reason: 'role_must_be_fundi',
      });
      throw forbidden('Only approved fundis can perform this action');
    }
    const fundi = await query(
      'select approval_status, online from fundis where user_id = $1',
      [req.user.id],
    );
    const approvalStatus = fundi.rows[0]?.approval_status;
    if (approvalStatus !== 'approved') {
      await logAccessDecision(req, 'requireApprovedFundi:approval_denied', { approvalStatus });
      throw forbidden('Your fundi account is pending admin approval');
    }
    req.fundiProfile = fundi.rows[0];
    await logAccessDecision(req, 'requireApprovedFundi:allowed', { approvalStatus });
    return next();
  } catch (err) {
    return next(err);
  }
}
