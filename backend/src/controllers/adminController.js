import { query } from '../db.js';

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
    const result = await query(`select * from ${table} order by created_at desc limit 100`);
    res.json({ success: true, [key]: result.rows, pagination: { page: 1, total: result.rows.length } });
  };
}

export async function approveFundi(req, res) {
  const result = await query(
    `update fundis set approval_status = 'approved', approved_at = now(), updated_at = now()
     where id = $1 or user_id = $1 returning *`,
    [req.params.id],
  );
  res.json({ success: true, fundi: result.rows[0] });
}

export async function rejectFundi(req, res) {
  const result = await query(
    `update fundis set approval_status = 'rejected', rejection_reason = $2, updated_at = now()
     where id = $1 or user_id = $1 returning *`,
    [req.params.id, req.body?.reason || null],
  );
  res.json({ success: true, fundi: result.rows[0] });
}

export async function securityOverview(_req, res) {
  const [alerts, trust] = await Promise.all([
    query(`select * from fraud_alerts order by created_at desc limit 50`),
    query(`select * from trust_scores order by updated_at desc limit 50`),
  ]);
  res.json({ success: true, alerts: alerts.rows, scores: trust.rows });
}
