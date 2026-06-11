import { query } from '../db.js';

/** Temporary structured debug logging for auth/role/approval investigations. */
export async function logAccessDecision(req, label, extra = {}) {
  if (process.env.ACCESS_DEBUG !== 'true' && process.env.NODE_ENV === 'production') return;
  let approvalStatus = null;
  if (req.user?.id) {
    try {
      const fundi = await query('select approval_status, online from fundis where user_id = $1', [req.user.id]);
      approvalStatus = fundi.rows[0]?.approval_status ?? null;
    } catch {
      approvalStatus = 'lookup_failed';
    }
  }
  console.info('[access-debug]', JSON.stringify({
    label,
    method: req.method,
    path: req.originalUrl || req.path,
    userId: req.user?.id ?? null,
    dbRole: req.user?.role ?? null,
    userStatus: req.user?.status ?? null,
    fundiApprovalStatus: approvalStatus,
    ...extra,
  }));
}
