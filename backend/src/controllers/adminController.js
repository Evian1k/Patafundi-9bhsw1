import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

const tableOrderBy = {
  trust_scores: 'updated_at',
};

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

function publicFundi(row) {
  if (!row) return null;
  const [firstName = row.full_name || '', ...rest] = String(row.full_name || '').split(' ');
  return {
    ...row,
    userId: row.user_id,
    firstName,
    lastName: rest.join(' '),
    verificationStatus: row.approval_status,
    idNumber: row.id_number || '',
    idPhotoUrl: row.id_photo_url || '',
    selfieUrl: row.selfie_url || '',
    experienceYears: row.experience || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function dashboard(req, res) {
  const [users, jobs, payments, disputes, revenue] = await Promise.all([
    query('select count(*)::int as total from users'),
    query('select count(*)::int as total from jobs'),
    query(`select coalesce(sum(amount),0)::numeric as total from payments where status = 'completed'`),
    query(`select count(*)::int as total from disputes where status = 'open'`),
    revenueSummaryQuery(),
  ]);
  res.json({
    success: true,
    stats: {
      users: users.rows[0].total,
      jobs: jobs.rows[0].total,
      revenue: Number(payments.rows[0].total),
      platformRevenue: revenue.totals.lifetimeRevenue,
      netProfit: revenue.totals.netProfit,
      openDisputes: disputes.rows[0].total,
      revenueBreakdown: revenue,
    },
  });
}

export function listTable(table, key) {
  return async (_req, res) => {
    if (!tableSelects[table]) throw badRequest('Unsupported admin table');
    const orderCol = tableOrderBy[table] || 'created_at';
    const result = await query(`${tableSelects[table]} order by ${orderCol} desc limit 100`);
    const rows = table === 'fundis' ? result.rows.map(publicFundi) : result.rows;
    res.json({ success: true, [key]: rows, pagination: { page: 1, limit: 100, total: rows.length, pages: 1 } });
  };
}

export async function listJobs(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();

  const filters = [];
  const params = [];
  if (status) {
    params.push(status);
    filters.push(`j.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    filters.push(`(j.description ilike $${idx} or j.location_name ilike $${idx} or j.service_category ilike $${idx} or cu.full_name ilike $${idx})`);
  }
  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  const countResult = await query(
    `select count(*)::int as total
     from jobs j
     join users cu on cu.id = j.customer_id
     left join users fu on fu.id = j.fundi_id
     ${where}`,
    params,
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit, offset);
  const result = await query(
    `select j.id, j.service_category, j.description, j.location_name, j.status,
            j.estimated_price, j.final_price, j.customer_id, j.fundi_id,
            j.created_at, j.updated_at,
            cu.full_name as customer_name,
            fu.full_name as fundi_name
     from jobs j
     join users cu on cu.id = j.customer_id
     left join users fu on fu.id = j.fundi_id
     ${where}
     order by j.created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  res.json({
    success: true,
    jobs: result.rows.map((row) => ({
      id: row.id,
      title: `${row.service_category || 'Service'} job`,
      description: row.description,
      category: row.service_category,
      status: row.status,
      customerId: row.customer_id,
      customerName: row.customer_name,
      fundiId: row.fundi_id,
      fundiName: row.fundi_name,
      estimatedPrice: Number(row.estimated_price || 0),
      finalPrice: Number(row.final_price || 0),
      location: row.location_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function listCustomers(_req, res) {
  const result = await query(
    `${tableSelects.users} where role = 'customer' order by created_at desc limit 100`,
  );
  res.json({
    success: true,
    customers: result.rows,
    pagination: { page: 1, limit: 100, total: result.rows.length, pages: 1 },
  });
}

export async function searchFundis(req, res) {
  const status = req.query.status ? String(req.query.status) : null;
  const q = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;
  const result = await query(
    `${tableSelects.fundis}
     where ($1::text is null or f.approval_status = $1)
       and ($2::text is null or lower(u.full_name) like $2 or lower(u.email) like $2 or u.phone like $2)
     order by f.created_at desc limit 100`,
    [status, q],
  );
  const fundis = result.rows.map(publicFundi);
  res.json({ success: true, fundis, pagination: { page: 1, limit: 100, total: fundis.length, pages: 1 } });
}

export async function getFundi(req, res) {
  const result = await query(
    `${tableSelects.fundis} where f.id = $1 or f.user_id = $1 limit 1`,
    [req.params.id],
  );
  if (!result.rows[0]) throw notFound('Fundi not found');
  res.json({ success: true, fundi: publicFundi(result.rows[0]) });
}

export async function transactions(_req, res) {
  const result = await query(
    `select p.id, p.job_id, p.customer_id, cu.full_name as customer_name,
            j.fundi_id, fu.full_name as fundi_name, p.amount, p.platform_commission,
            p.fundi_amount, p.provider, p.status, p.created_at
     from payments p
     join jobs j on j.id = p.job_id
     join users cu on cu.id = p.customer_id
     left join users fu on fu.id = j.fundi_id
     order by p.created_at desc limit 100`,
  );
  const transactions = result.rows.map((row) => {
    const amount = Number(row.amount || 0);
    const commission = Number(row.platform_commission || 0);
    return {
      id: row.id,
      jobId: row.job_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      fundiId: row.fundi_id,
      fundiName: row.fundi_name || 'Unassigned',
      amount,
      commission,
      fundiEarnings: Number(row.fundi_amount || (amount - commission)),
      status: row.status,
      paymentMethod: row.provider,
      createdAt: row.created_at,
    };
  });
  const completed = transactions.filter((tx) => tx.status === 'completed');
  res.json({
    success: true,
    transactions,
    count: transactions.length,
    totalRevenue: completed.reduce((sum, tx) => sum + tx.amount, 0),
    totalCommission: completed.reduce((sum, tx) => sum + tx.commission, 0),
    pagination: { page: 1, total: transactions.length },
  });
}

async function revenueSummaryQuery() {
  const result = await query(
    `select
       coalesce(sum(amount) filter (where period_date = current_date), 0)::numeric as daily_revenue,
       coalesce(sum(amount) filter (where period_date >= current_date - interval '6 days'), 0)::numeric as weekly_revenue,
       coalesce(sum(amount) filter (where period_date >= date_trunc('month', current_date)), 0)::numeric as monthly_revenue,
       coalesce(sum(amount) filter (where period_date >= date_trunc('year', current_date)), 0)::numeric as yearly_revenue,
       coalesce(sum(amount), 0)::numeric as lifetime_revenue,
       coalesce(sum(amount) filter (where entry_type = 'commission'), 0)::numeric as commission_revenue,
       coalesce(sum(amount) filter (where entry_type = 'withdrawal_fee'), 0)::numeric as withdrawal_fee_revenue,
       coalesce(sum(amount) filter (where entry_type = 'subscription'), 0)::numeric as subscription_revenue,
       coalesce(sum(amount) filter (where entry_type = 'refund'), 0)::numeric as refund_costs
     from revenue_ledger`,
  );
  const row = result.rows[0] || {};
  const totals = {
    dailyRevenue: Number(row.daily_revenue || 0),
    weeklyRevenue: Number(row.weekly_revenue || 0),
    monthlyRevenue: Number(row.monthly_revenue || 0),
    yearlyRevenue: Number(row.yearly_revenue || 0),
    lifetimeRevenue: Number(row.lifetime_revenue || 0),
    commissionRevenue: Number(row.commission_revenue || 0),
    withdrawalFeeRevenue: Number(row.withdrawal_fee_revenue || 0),
    subscriptionRevenue: Number(row.subscription_revenue || 0),
    refundCosts: Number(row.refund_costs || 0),
  };
  totals.netProfit = totals.lifetimeRevenue - totals.refundCosts;
  return { totals };
}

export async function revenueDashboard(_req, res) {
  const summary = await revenueSummaryQuery();
  res.json({ success: true, ...summary });
}

export async function escrowQueue(_req, res) {
  const result = await query(
    `select j.id as job_id, cu.full_name as customer_name, fu.full_name as fundi_name,
            p.amount, j.updated_at as completed_at,
            extract(epoch from (now() - j.updated_at)) / 3600 as hours_elapsed,
            exists(select 1 from fraud_alerts fa where fa.job_id = j.id and fa.resolved_at is null) as flagged
     from jobs j
     join payments p on p.job_id = j.id and p.escrow_status in ('held', 'frozen')
     join users cu on cu.id = j.customer_id
     left join users fu on fu.id = j.fundi_id
     where j.status = 'completed'
     order by j.updated_at asc limit 100`,
  );
  res.json({
    success: true,
    queue: result.rows.map((row) => ({
      jobId: row.job_id,
      customerName: row.customer_name,
      fundiName: row.fundi_name || 'Unassigned',
      amount: Number(row.amount || 0),
      completedAt: row.completed_at,
      hoursElapsed: Math.round(Number(row.hours_elapsed || 0)),
      flagged: Boolean(row.flagged),
    })),
  });
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

export async function suspendFundi(req, res) {
  const result = await query(
    `update fundis set approval_status = 'suspended', rejection_reason = $2, online = false, updated_at = now()
     where id = $1 or user_id = $1 returning *`,
    [req.params.id, req.body?.reason || null],
  );
  if (!result.rows[0]) throw notFound('Fundi not found');
  await auditLog({ userId: req.user.id, action: 'admin.fundi.suspend', entityType: 'fundi', entityId: result.rows[0].id });
  res.json({ success: true, fundi: result.rows[0] });
}

export async function setFundiFinancialFreeze(req, res) {
  const { walletFrozen, payoutFrozen, reason = '' } = req.body || {};
  if (typeof walletFrozen !== 'boolean' && typeof payoutFrozen !== 'boolean') {
    throw badRequest('walletFrozen or payoutFrozen boolean is required');
  }
  const current = await query('select wallet_frozen, payout_frozen from fundis where user_id = $1 or id = $1', [req.params.id]);
  if (!current.rows[0]) throw notFound('Fundi not found');
  const nextWallet = typeof walletFrozen === 'boolean' ? walletFrozen : current.rows[0].wallet_frozen;
  const nextPayout = typeof payoutFrozen === 'boolean' ? payoutFrozen : current.rows[0].payout_frozen;
  const result = await query(
    `update fundis set wallet_frozen = $2, payout_frozen = $3, updated_at = now()
     where user_id = $1 or id = $1 returning *`,
    [req.params.id, nextWallet, nextPayout],
  );
  await auditLog({
    userId: req.user.id,
    action: 'admin.fundi.financial_freeze',
    entityType: 'fundi',
    entityId: result.rows[0].id,
    metadata: { walletFrozen: nextWallet, payoutFrozen: nextPayout, reason },
  });
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

const defaultSettings = {
  payments: {
    commissionRate: 0.15,
    commissionType: 'percentage',
    fixedCommissionKes: 0,
    categoryCommissionRates: {},
    promotionalDiscounts: {},
    withdrawalFeeType: 'flat',
    withdrawalFeeKes: 0,
    withdrawalFeeRate: 0,
    disputeWindowHours: 24,
    minimumPayoutKes: 100,
    minimumTrustScoreForPayout: 30,
  },
  security: {
    fraudAutoBlockSeverity: 'critical',
    uploadMaxBytes: 5 * 1024 * 1024,
    sessionMinutes: 15,
  },
  operations: {
    supportEmail: 'support@patafundi.com',
    autoAssignFundis: true,
  },
};

export async function getSettings(_req, res) {
  const result = await query(`select value from platform_settings where key = 'global'`);
  res.json({ success: true, settings: result.rows[0]?.value || defaultSettings });
}

export async function updateSettings(req, res) {
  const nextSettings = req.body || {};
  if (typeof nextSettings !== 'object' || Array.isArray(nextSettings)) throw badRequest('Settings payload must be an object');
  const merged = {
    ...defaultSettings,
    ...nextSettings,
    payments: { ...defaultSettings.payments, ...(nextSettings.payments || {}) },
    security: { ...defaultSettings.security, ...(nextSettings.security || {}) },
    operations: { ...defaultSettings.operations, ...(nextSettings.operations || {}) },
  };
  const result = await query(
    `insert into platform_settings (key, value, updated_by)
     values ('global', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
     returning value`,
    [JSON.stringify(merged), req.user.id],
  );
  await auditLog({ userId: req.user.id, action: 'admin.settings.update', entityType: 'platform_settings', metadata: merged });
  res.json({ success: true, settings: result.rows[0].value });
}
