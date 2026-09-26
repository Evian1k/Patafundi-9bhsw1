// workerAccess.js — allows approved individual fundis OR active company
// technicians to perform job-execution actions (check-in, complete, status).
// The controller still enforces assignment on the specific job.
import { query } from '../db.js';
import { forbidden } from '../utils/http.js';

export async function isApprovedWorker(user) {
  if (!user) return false;
  if (user.isAdmin || user.role === 'admin' || user.role === 'super_admin') return true;
  const fundi = await query(
    `select approval_status from fundis where user_id = $1`,
    [user.id],
  );
  if (fundi.rows[0]?.approval_status === 'approved') return true;
  const member = await query(
    `select id from company_members where user_id = $1 and status = 'active'
       and role in ('technician', 'manager', 'owner') limit 1`,
    [user.id],
  );
  return Boolean(member.rows[0]);
}

export async function requireApprovedWorker(req, _res, next) {
  try {
    if (await isApprovedWorker(req.user)) return next();
    throw forbidden('Only approved fundis or active company technicians can perform this action');
  } catch (error) {
    next(error);
  }
}
