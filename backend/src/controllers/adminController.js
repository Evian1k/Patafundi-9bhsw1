import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

const tableSelects = {
  fundis: `select f.id, f.user_id, u.full_name, u.email, u.phone, f.skills, f.experience, f.bio,
                  f.mpesa_number, f.approval_status, f.rejection_reason, f.approved_at,
                  f.online, f.rating, f.trust_score, f.created_at, f.updated_at
           from fundis f join users u on u.id = f.user_id`,
  users: `select id, email, full_name, phone, role, status, trust_score, created_at, updated_at from users`,
  jobs: `select * from jobs`,
  payments: `select id, job_id, customer_id, amount, currency, provider, mpesa_number, status,
                    escrow_status, checkout_request_id, merchant_request_id, mpesa_receipt_number,
                    failure_reason, paid_at, created_at, updated_at
             from payments`,
  escrow_transactions: `select * from escrow_transactions`,
  audit_logs: `select * from audit_logs`,
  fraud_alerts: `select * from fraud_alerts`,
  trust_scores: `select * from trust_scores`,
  notifications: `select * from notifications`,
};

export async function dashboard(req, res) {
  const [users, jobs, payments, disputes] = await Promise.all([
    query('select count(*)::int as total from users'),
    query('select count(*)::int as total from jobs'),
    query(`select coalesce(sum(amount),0)::numeric as total from payments where status = 'completed'`),
    query(`select count(*)::int as total from disputes where status = 'open'`),
  ]);
  res.json({
    success: true,
    stats: {
      users: users.rows[0].total,
      jobs: jobs.rows[0].total,
      revenue: Number(payments.rows[0].total),
      openDisputes: disputes.rows[0].total,
    },
  });
}

export async function listTable(table, key) {
  return async (_req, res) => {
    if (!tableSelects[table]) throw badRequest('Unsupported admin table');
    const result = await query(`${tableSelects[table]} order by created_at desc limit 100`);
    res.json({ success: true, [key]: result.rows, pagination: { page: 1, total: result.rows.length } });
  };
}

export async function approveFundi(req, res) {
  const result = await query(
    `update fundis set approval_status = 'approved', approved_at = now(), updated_at = now()
     where id = $1 or user_id = $1 returning *`,
    [req.params.id],
  );
  if (!result.rows[0]) throw notFound('Fundi not found');
  await query(`update users set role = 'fundi', status = 'active', updated_at = now() where id = $1`, [result.rows[0].user_id]);
  await auditLog({ userId: req.user.id, action: 'admin.fundi.approve', entityType: 'fundi', entityId: result.rows[0].id });
  res.json({ success: true, fundi: result.rows[0] });
}

export async function rejectFundi(req, res) {
  const result = await query(
    `update fundis set approval_status = 'rejected', rejection_reason = $2, updated_at = now()
     where id = $1 or user_id = $1 returning *`,
    [req.params.id, req.body?.reason || null],
  );
  if (!result.rows[0]) throw notFound('Fundi not found');
  await auditLog({ userId: req.user.id, action: 'admin.fundi.reject', entityType: 'fundi', entityId: result.rows[0].id });
  res.json({ success: true, fundi: result.rows[0] });
}

async function setUserStatus(req, res, status) {
  const result = await query(
    `update users set status = $2, updated_at = now()
     where id = $1 and role <> 'admin'
     returning id, email, full_name, role, status`,
    [req.params.id, status],
  );
  if (!result.rows[0]) throw notFound('User not found or protected');
  if (status === 'disabled') {
    await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.params.id]);
  }
  await auditLog({ userId: req.user.id, action: `admin.user.${status}`, entityType: 'user', entityId: req.params.id });
  res.json({ success: true, user: result.rows[0] });
}

export async function blockUser(req, res) {
  return setUserStatus(req, res, 'disabled');
}

export async function unblockUser(req, res) {
  return setUserStatus(req, res, 'active');
}

export async function forceLogout(req, res) {
  const result = await query(
    `update refresh_tokens set revoked_at = now()
     where user_id = $1 and revoked_at is null
     returning id`,
    [req.params.id],
  );
  await auditLog({ userId: req.user.id, action: 'admin.user.force_logout', entityType: 'user', entityId: req.params.id });
  res.json({ success: true, revokedSessions: result.rowCount || 0 });
}

export async function resolveSecurityAlert(req, res) {
  const result = await query(
    `update fraud_alerts set resolved_at = now()
     where id = $1 and resolved_at is null returning *`,
    [req.params.id],
  );
  if (!result.rows[0]) throw notFound('Security alert not found');
  await auditLog({ userId: req.user.id, action: 'admin.security_alert.resolve', entityType: 'fraud_alert', entityId: req.params.id });
  res.json({ success: true, alert: result.rows[0] });
}

export async function securityOverview(_req, res) {
  const [alerts, trust] = await Promise.all([
    query(`select * from fraud_alerts order by created_at desc limit 50`),
    query(`select * from trust_scores order by updated_at desc limit 50`),
  ]);
  res.json({ success: true, alerts: alerts.rows, scores: trust.rows });
}
