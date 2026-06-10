import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { adjustTrustScore, riskLevelFromScore } from '../services/fraudService.js';
import { getJobTimeline } from '../services/timelineService.js';

function parseDateRange(req) {
  const period = String(req.query.period || '30d');
  const now = new Date();
  let from;
  if (period === 'today') from = new Date(now.setHours(0, 0, 0, 0));
  else if (period === '7d') from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  else if (period === '30d') from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  else if (req.query.from) from = new Date(req.query.from);
  else from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function fraudDashboard(req, res) {
  const { from, to } = parseDateRange(req);
  const [alerts, debts, suspiciousJobs, fraudScores, revenue] = await Promise.all([
    query(
      `select count(*) filter (where resolved_at is null)::int as open,
              count(*) filter (where severity = 'critical')::int as critical,
              count(*)::int as total
       from fraud_alerts where created_at between $1 and $2`,
      [from, to],
    ),
    query(
      `select coalesce(sum(amount) filter (where status in ('pending','invoiced','overdue')), 0)::numeric as outstanding,
              coalesce(sum(amount) filter (where status = 'deducted'), 0)::numeric as recovered,
              count(*)::int as total
       from commission_debts where created_at between $1 and $2`,
      [from, to],
    ),
    query(
      `select count(*)::int as total from expected_commissions
       where flagged_suspicious = true and flagged_at between $1 and $2`,
      [from, to],
    ),
    query(
      `select count(*) filter (where risk_level = 'critical')::int as critical,
              count(*) filter (where risk_level = 'high')::int as high,
              count(*)::int as monitored
       from user_fraud_scores where fraud_score >= 26`,
    ),
    query(
      `select coalesce(sum(amount), 0)::numeric as total from revenue_ledger
       where entry_type = 'commission' and created_at between $1 and $2`,
      [from, to],
    ),
  ]);
  res.json({
    success: true,
    dashboard: {
      period: { from, to },
      fraudAlerts: alerts.rows[0],
      commissionDebts: debts.rows[0],
      suspiciousJobs: suspiciousJobs.rows[0]?.total || 0,
      fraudScores: fraudScores.rows[0],
      commissionRevenue: Number(revenue.rows[0]?.total || 0),
    },
  });
}

export async function listFraudAlerts(req, res) {
  const { from, to } = parseDateRange(req);
  const severity = req.query.severity ? String(req.query.severity) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const params = [from, to];
  const filters = ['fa.created_at between $1 and $2'];
  if (severity) { params.push(severity); filters.push(`fa.severity = $${params.length}`); }
  if (status) { params.push(status); filters.push(`fa.status = $${params.length}`); }
  const result = await query(
    `select fa.*, u.full_name as user_name, u.email as user_email, j.service_category
     from fraud_alerts fa
     left join users u on u.id = fa.user_id
     left join jobs j on j.id = fa.job_id
     where ${filters.join(' and ')}
     order by fa.created_at desc limit 200`,
    params,
  );
  res.json({ success: true, alerts: result.rows });
}

export async function listCommissionDebts(req, res) {
  const status = req.query.status ? String(req.query.status) : null;
  const params = [];
  const where = status ? `where cd.status = $1` : '';
  if (status) params.push(status);
  const result = await query(
    `select cd.*, u.full_name, u.email, j.service_category
     from commission_debts cd
     join users u on u.id = cd.user_id
     left join jobs j on j.id = cd.job_id
     ${where}
     order by cd.created_at desc limit 200`,
    params,
  );
  res.json({ success: true, debts: result.rows });
}

export async function listSuspiciousJobs(req, res) {
  const result = await query(
    `select ec.*, j.status, j.payment_status, j.escrow_status,
            cu.full_name as customer_name, fu.full_name as fundi_name
     from expected_commissions ec
     join jobs j on j.id = ec.job_id
     join users cu on cu.id = ec.customer_id
     join users fu on fu.id = ec.fundi_id
     where ec.flagged_suspicious = true or (j.status = 'completed' and ec.payment_received = false)
     order by ec.updated_at desc limit 100`,
  );
  res.json({ success: true, jobs: result.rows });
}

export async function listSuspiciousUsers(req, res) {
  const role = req.query.role ? String(req.query.role) : null;
  const params = [];
  let roleFilter = '';
  if (role) { params.push(role); roleFilter = `and u.role = $${params.length}`; }
  const result = await query(
    `select ufs.*, u.full_name, u.email, u.role, u.status, ts.score as trust_score
     from user_fraud_scores ufs
     join users u on u.id = ufs.user_id
     left join trust_scores ts on ts.user_id = u.id
     where ufs.fraud_score >= 26 ${roleFilter}
     order by ufs.fraud_score desc limit 100`,
    params,
  );
  res.json({ success: true, users: result.rows });
}

export async function getJobTimelineAdmin(req, res) {
  const timeline = await getJobTimeline(req.params.jobId);
  res.json({ success: true, timeline });
}

export async function fraudReports(req, res) {
  const { from, to } = parseDateRange(req);
  const format = String(req.query.format || 'json');
  const [attempts, debts, suspended, trustTrends, revenue] = await Promise.all([
    query(`select count(*)::int as total from fraud_detection_events where created_at between $1 and $2`, [from, to]),
    query(
      `select status, coalesce(sum(amount),0)::numeric as total, count(*)::int as count
       from commission_debts where created_at between $1 and $2 group by status`,
      [from, to],
    ),
    query(`select count(*)::int as total from users where status = 'disabled'`, []),
    query(
      `select date_trunc('day', created_at) as day, avg(new_score)::numeric as avg_score
       from trust_score_history where created_at between $1 and $2 group by 1 order by 1`,
      [from, to],
    ),
    query(
      `select coalesce(sum(amount),0)::numeric as total from revenue_ledger
       where entry_type = 'commission' and created_at between $1 and $2`,
      [from, to],
    ),
  ]);
  const report = {
    period: { from, to },
    fraudAttempts: attempts.rows[0]?.total || 0,
    commissionDebts: debts.rows,
    suspendedAccounts: suspended.rows[0]?.total || 0,
    trustScoreTrends: trustTrends.rows,
    totalRevenue: Number(revenue.rows[0]?.total || 0),
    outstandingDebts: debts.rows.reduce((s, r) => (
      ['pending', 'invoiced', 'overdue'].includes(r.status) ? s + Number(r.total) : s
    ), 0),
    recoveredCommissions: debts.rows.find((r) => r.status === 'deducted')?.total || 0,
  };
  if (format === 'csv') {
    const lines = [
      'metric,value',
      `fraud_attempts,${report.fraudAttempts}`,
      `total_revenue,${report.totalRevenue}`,
      `outstanding_debts,${report.outstandingDebts}`,
      `suspended_accounts,${report.suspendedAccounts}`,
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=fraud-report.csv');
    return res.send(lines.join('\n'));
  }
  res.json({ success: true, report });
}

export async function adminFraudAction(req, res) {
  const { action, userId, alertId, debtId, note } = req.body || {};
  if (!action) throw badRequest('Action is required');

  if (action === 'warn') {
    if (!userId) throw badRequest('userId required');
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'fraud_warning', 'Platform Warning', $2, $3::jsonb)`,
      [userId, note || 'You have received a warning for policy violations.', JSON.stringify({ adminId: req.user.id })],
    );
    if (alertId) {
      await query(`update fraud_alerts set status = 'warned', action_taken = 'warned' where id = $1`, [alertId]);
    }
    await auditLog({ userId: req.user.id, action: 'fraud.warn_user', entityType: 'user', entityId: userId, metadata: { note } });
    return res.json({ success: true, message: 'Warning sent' });
  }

  if (action === 'suspend' || action === 'ban') {
    if (!userId) throw badRequest('userId required');
    const status = action === 'ban' ? 'disabled' : 'disabled';
    await query(`update users set status = $2, updated_at = now() where id = $1 and role <> 'admin'`, [userId, status]);
    await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
    await adjustTrustScore({ userId, delta: -30, reason: `Account ${action}ed by admin`, sourceType: 'admin_action' });
    if (alertId) await query(`update fraud_alerts set status = 'escalated', action_taken = $2 where id = $1`, [alertId, action]);
    await auditLog({ userId: req.user.id, action: `fraud.${action}_user`, entityType: 'user', entityId: userId });
    return res.json({ success: true, message: `User ${action}ed` });
  }

  if (action === 'resolve') {
    if (!alertId) throw badRequest('alertId required');
    const result = await query(
      `update fraud_alerts set resolved_at = now(), status = 'resolved', action_taken = 'resolved'
       where id = $1 returning *`,
      [alertId],
    );
    if (!result.rows[0]) throw notFound('Alert not found');
    await auditLog({ userId: req.user.id, action: 'fraud.resolve_alert', entityType: 'fraud_alert', entityId: alertId });
    return res.json({ success: true, alert: result.rows[0] });
  }

  if (action === 'invoice') {
    if (!debtId) throw badRequest('debtId required');
    const ref = `INV-${Date.now()}`;
    const result = await query(
      `update commission_debts set status = 'invoiced', invoice_reference = $2, updated_at = now()
       where id = $1 and status = 'pending' returning *`,
      [debtId, ref],
    );
    if (!result.rows[0]) throw notFound('Debt not found or already invoiced');
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'commission_invoice', 'Commission Invoice', $2, $3::jsonb)`,
      [
        result.rows[0].user_id,
        `Invoice ${ref} for KES ${result.rows[0].amount} commission owed.`,
        JSON.stringify({ debtId, invoiceReference: ref }),
      ],
    );
    await auditLog({ userId: req.user.id, action: 'fraud.create_invoice', entityType: 'commission_debt', entityId: debtId });
    return res.json({ success: true, debt: result.rows[0] });
  }

  throw badRequest('Unknown action');
}

export async function getUserFraudProfile(req, res) {
  const userId = req.params.userId;
  const [fraudScore, trust, alerts, debts, events] = await Promise.all([
    query('select * from user_fraud_scores where user_id = $1', [userId]),
    query('select * from trust_scores where user_id = $1', [userId]),
    query(`select * from fraud_alerts where user_id = $1 order by created_at desc limit 20`, [userId]),
    query(`select * from commission_debts where user_id = $1 order by created_at desc`, [userId]),
    query(`select * from fraud_detection_events where user_id = $1 order by created_at desc limit 50`, [userId]),
  ]);
  res.json({
    success: true,
    profile: {
      fraudScore: fraudScore.rows[0] || { fraud_score: 0, risk_level: 'low' },
      trustScore: trust.rows[0],
      riskLevel: riskLevelFromScore(fraudScore.rows[0]?.fraud_score || 0),
      alerts: alerts.rows,
      debts: debts.rows,
      events: events.rows,
    },
  });
}
