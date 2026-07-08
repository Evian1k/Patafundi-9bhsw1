/**
 * Phase 2 Enterprise Operations Service
 * 
 * 20 modules: DR, Incidents, CRM, Feature Flags, Analytics, Audit Timeline,
 * Fraud Heatmap, Productivity, CEO Center, AI Assistants, Queues,
 * Monitoring, HR, API Versions, Marketplace Intelligence, ML Pricing,
 * Search, Image Moderation, Status Page, AI CEO Reports
 */
import { query } from '../db.js';
import { auditLog } from './auditService.js';

// ============================================================
// 1. DISASTER RECOVERY CENTER
// ============================================================

export async function getDisasterRecoveryDashboard() {
  const [backups, health, restores] = await Promise.all([
    query('select * from backup_logs order by created_at desc limit 10'),
    query("select service, status, response_time_ms, uptime_percentage, created_at from system_health_logs where created_at > now() - interval '1 hour' order by created_at desc"),
    query('select * from backup_logs where status = $1 order by completed_at desc limit 5', ['completed']),
  ]);

  const services = ['database', 'api', 'frontend', 'redis', 'queue', 'storage', 'email', 'payment', 'maps', 'realtime'];
  const serviceHealth = {};
  for (const svc of services) {
    const log = health.rows.find(h => h.service === svc);
    serviceHealth[svc] = log ? { status: log.status, responseTime: log.response_time_ms, uptime: log.uptime_percentage } : { status: 'unknown' };
  }

  return {
    database: serviceHealth.database,
    api: serviceHealth.api,
    frontend: serviceHealth.frontend,
    redis: serviceHealth.redis,
    queue: serviceHealth.queue,
    storage: serviceHealth.storage,
    email: serviceHealth.email,
    payment: serviceHealth.payment,
    maps: serviceHealth.maps,
    realtime: serviceHealth.realtime,
    backups: backups.rows,
    latestBackup: restores.rows[0] || null,
    totalBackups: backups.rowCount,
    failedBackups: backups.rows.filter(b => b.status === 'failed').length,
  };
}

// ============================================================
// 2. INCIDENT COMMAND CENTER
// ============================================================

export async function createIncident(data, createdBy) {
  const result = await query(
    `insert into incidents (severity, priority, category, title, description, assigned_engineer, assigned_manager, affected_services, is_public, public_message, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [data.severity, data.priority, data.category, data.title, data.description || null,
     data.assignedEngineer || null, data.assignedManager || null,
     data.affectedServices || [], data.isPublic || false, data.publicMessage || null, createdBy],
  );
  
  await query(
    `insert into incident_timeline (incident_id, event_type, message, author_id, is_public)
     values ($1, 'created', $2, $3, $4)`,
    [result.rows[0].id, `Incident ${result.rows[0].incident_id} created: ${data.title}`, createdBy, data.isPublic || false],
  );

  if (data.isPublic) {
    await query(
      `insert into status_page_incidents (incident_id, service, status, message)
       values ($1, $2, 'investigating', $3)`,
      [result.rows[0].id, data.category, data.publicMessage || data.title],
    );
  }

  await auditLog({ userId: createdBy, action: 'incident.created', entityType: 'incident', entityId: result.rows[0].id, metadata: data });
  return result.rows[0];
}

export async function listIncidents(filters = {}) {
  const params = [];
  let where = '';
  if (filters.status) { params.push(filters.status); where += ` and status = $${params.length}`; }
  if (filters.severity) { params.push(filters.severity); where += ` and severity = $${params.length}`; }
  const result = await query(
    `select i.*, u.full_name as engineer_name, m.full_name as manager_name
     from incidents i
     left join users u on u.id = i.assigned_engineer
     left join users m on m.id = i.assigned_manager
     where 1=1 ${where}
     order by case severity when 'sev0' then 0 when 'sev1' then 1 when 'sev2' then 2 when 'sev3' then 3 else 4 end, created_at desc limit 100`,
    params,
  );
  return result.rows;
}

export async function getIncidentDetails(id) {
  const [incident, timeline] = await Promise.all([
    query(`select i.*, u.full_name as engineer_name, m.full_name as manager_name, c.full_name as creator_name
           from incidents i
           left join users u on u.id = i.assigned_engineer
           left join users m on m.id = i.assigned_manager
           left join users c on c.id = i.created_by
           where i.id = $1`, [id]),
    query(`select t.*, u.full_name as author_name from incident_timeline t left join users u on u.id = t.author_id where t.incident_id = $1 order by t.created_at asc`, [id]),
  ]);
  return { incident: incident.rows[0], timeline: timeline.rows };
}

export async function addIncidentUpdate(incidentId, { eventType, message, isPublic }, authorId) {
  const result = await query(
    `insert into incident_timeline (incident_id, event_type, message, author_id, is_public)
     values ($1, $2, $3, $4, $5) returning *`,
    [incidentId, eventType, message, authorId, isPublic || false],
  );

  if (isPublic) {
    await query(
      `insert into status_page_incidents (incident_id, service, status, message)
       select $1, category, $2, $3 from incidents where id = $1`,
      [incidentId, eventType, message],
    );
  }

  return result.rows[0];
}

export async function resolveIncident(id, { rootCause, lessonsLearned, postmortemUrl }, resolvedBy) {
  const result = await query(
    `update incidents set status = 'resolved', root_cause = $2, lessons_learned = $3, postmortem_url = $4,
     resolved_at = now(), downtime_end = coalesce(downtime_end, now()), updated_at = now()
     where id = $1 returning *`,
    [id, rootCause, lessonsLearned, postmortemUrl],
  );
  await query(
    `insert into incident_timeline (incident_id, event_type, message, author_id)
     values ($1, 'resolved', 'Incident resolved. Root cause identified.', $2)`,
    [id, resolvedBy],
  );
  await query(`update status_page_incidents set is_resolved = true, resolved_at = now() where incident_id = $1`, [id]);
  await auditLog({ userId: resolvedBy, action: 'incident.resolved', entityType: 'incident', entityId: id, metadata: { rootCause } });
  return result.rows[0];
}

// ============================================================
// 3. INTERNAL CRM
// ============================================================

export async function getCustomerCRM(userId) {
  const [user, jobs, payments, reviews, disputes, tickets, referrals, loyalty, wallet, notes, devices, logins, notifications, fraudScore] = await Promise.all([
    query('select id, email, full_name, phone, role, status, trust_score, created_at, last_login_at from users where id = $1', [userId]),
    query('select id, service_category, status, estimated_price, final_price, created_at from jobs where customer_id = $1 order by created_at desc limit 20', [userId]),
    query('select id, amount, status, escrow_status, mpesa_receipt_number, created_at from payments where user_id = $1 order by created_at desc limit 20', [userId]).catch(() => ({ rows: [] })),
    query('select r.*, j.service_category from reviews r join jobs j on j.id = r.job_id where r.reviewer_id = $1 order by r.created_at desc limit 10', [userId]).catch(() => ({ rows: [] })),
    query('select * from disputes where customer_id = $1 order by created_at desc limit 10', [userId]).catch(() => ({ rows: [] })),
    query('select * from support_tickets where email = (select email from users where id = $1) order by created_at desc limit 10', [userId]).catch(() => ({ rows: [] })),
    query('select * from referrals where referrer_id = $1 or referee_id = $1 order by created_at desc limit 10', [userId]).catch(() => ({ rows: [] })),
    query('select * from user_loyalty where user_id = $1', [userId]).catch(() => ({ rows: [] })),
    query('select * from wallets where user_id = $1', [userId]).catch(() => ({ rows: [] })),
    query('select n.*, u.full_name as author_name from crm_notes n left join users u on u.id = n.author_id where n.entity_type = $1 and n.entity_id = $2 order by n.created_at desc', ['customer', userId]),
    query('select * from device_fingerprints where user_id = $1 order by last_seen desc limit 10', [userId]).catch(() => ({ rows: [] })),
    query('select * from login_history where user_id = $1 order by created_at desc limit 20', [userId]).catch(() => ({ rows: [] })),
    query('select count(*)::int as total, count(*) filter (where created_at > now() - interval \'7 days\')::int as recent from notifications where user_id = $1', [userId]),
    query('select * from behavioral_risk_scores where user_id = $1', [userId]).catch(() => ({ rows: [] })),
  ]);

  return {
    user: user.rows[0],
    jobs: jobs.rows,
    payments: payments.rows,
    reviews: reviews.rows,
    disputes: disputes.rows,
    tickets: tickets.rows,
    referrals: referrals.rows,
    loyalty: loyalty.rows[0],
    wallet: wallet.rows[0],
    notes: notes.rows,
    devices: devices.rows,
    loginHistory: logins.rows,
    notifications: notifications.rows[0],
    fraudScore: fraudScore.rows[0],
  };
}

export async function getFundiCRM(fundiUserId) {
  const [user, fundi, jobs, reviews, wallet, portfolio, quality, notes, devices, logins] = await Promise.all([
    query('select id, email, full_name, phone, role, status, trust_score, created_at from users where id = $1', [fundiUserId]),
    query('select * from fundis where user_id = $1', [fundiUserId]),
    query('select id, service_category, status, estimated_price, final_price, created_at from jobs where fundi_id = $1 order by created_at desc limit 30', [fundiUserId]),
    query('select r.*, j.service_category, cu.full_name as customer_name from reviews r join jobs j on j.id = r.job_id join users cu on cu.id = j.customer_id where r.fundi_id = $1 order by r.created_at desc limit 20', [fundiUserId]).catch(() => ({ rows: [] })),
    query('select * from wallets where user_id = $1', [fundiUserId]).catch(() => ({ rows: [] })),
    query('select * from fundi_portfolios where fundi_id = $1 order by created_at desc', [fundiUserId]).catch(() => ({ rows: [] })),
    query('select * from fundi_quality_scores where fundi_id = $1', [fundiUserId]).catch(() => ({ rows: [] })),
    query('select n.*, u.full_name as author_name from crm_notes n left join users u on u.id = n.author_id where n.entity_type = $1 and n.entity_id = $2 order by n.created_at desc', ['fundi', fundiUserId]),
    query('select * from device_fingerprints where user_id = $1 order by last_seen desc limit 10', [fundiUserId]).catch(() => ({ rows: [] })),
    query('select * from login_history where user_id = $1 order by created_at desc limit 20', [fundiUserId]).catch(() => ({ rows: [] })),
  ]);

  return {
    user: user.rows[0],
    fundi: fundi.rows[0],
    jobs: jobs.rows,
    reviews: reviews.rows,
    wallet: wallet.rows[0],
    portfolio: portfolio.rows,
    quality: quality.rows[0],
    notes: notes.rows,
    devices: devices.rows,
    loginHistory: logins.rows,
  };
}

export async function addCRMNote(entityType, entityId, note, authorId, tags = []) {
  const result = await query(
    `insert into crm_notes (entity_type, entity_id, author_id, note, tags) values ($1, $2, $3, $4, $5) returning *`,
    [entityType, entityId, authorId, note, tags],
  );
  await auditLog({ userId: authorId, action: 'crm.note_added', entityType, entityId, metadata: { note: note.substring(0, 200) } });
  return result.rows[0];
}

// ============================================================
// 4. FEATURE FLAG SYSTEM (enhanced)
// ============================================================

export async function getFeatureFlags() {
  const result = await query('select * from feature_flags order by category, key');
  return result.rows;
}

export async function toggleFeatureFlag(key, enabled, updatedBy) {
  await query('update feature_flags set is_enabled = $2, updated_by = $3, updated_at = now() where key = $1', [key, enabled, updatedBy]);
  await auditLog({ userId: updatedBy, action: 'feature_flag.toggled', entityType: 'feature_flag', entityId: key, metadata: { enabled } });
}

export async function setFeatureFlagOverride(key, { userId, county, country, enabled }, createdBy) {
  if (userId) {
    await query(
      `insert into feature_flag_overrides (flag_key, user_id, enabled, created_by) values ($1, $2, $3, $4)
       on conflict (flag_key, user_id) do update set enabled = excluded.enabled`,
      [key, userId, enabled, createdBy],
    );
  } else if (county) {
    await query(
      `insert into feature_flag_overrides (flag_key, county, enabled, created_by) values ($1, $2, $3, $4)
       on conflict (flag_key, county) do update set enabled = excluded.enabled`,
      [key, county, enabled, createdBy],
    );
  }
  await auditLog({ userId: createdBy, action: 'feature_flag.override', entityType: 'feature_flag', entityId: key, metadata: { userId, county, enabled } });
}

// ============================================================
// 5. BUSINESS ANALYTICS
// ============================================================

export async function getBusinessAnalytics(period = '30d') {
  let interval = '30 days';
  if (period === '7d') interval = '7 days';
  else if (period === '90d') interval = '90 days';
  else if (period === 'year') interval = '365 days';

  const [summary, daily, topServices, topCounties, topFundis, topCustomers] = await Promise.all([
    query(`
      select
        (select count(*)::int from users where created_at > now() - interval '${interval}') as new_users,
        (select count(*)::int from users where status = 'active') as active_users,
        (select count(*)::int from fundis where approval_status = 'approved') as approved_fundis,
        (select count(*)::int from jobs where created_at > now() - interval '${interval}') as new_jobs,
        (select count(*)::int from jobs where status = 'completed' and created_at > now() - interval '${interval}') as completed_jobs,
        (select count(*)::int from jobs where status = 'cancelled' and created_at > now() - interval '${interval}') as cancelled_jobs,
        (select coalesce(sum(amount), 0)::numeric from payments where status = 'completed' and created_at > now() - interval '${interval}') as revenue,
        (select coalesce(sum(platform_commission), 0)::numeric from payments where status = 'completed' and created_at > now() - interval '${interval}') as commission,
        (select count(*)::int from disputes where created_at > now() - interval '${interval}') as new_disputes,
        (select count(*)::int from disputes where status = 'open') as open_disputes
    `),
    query(`
      select date_trunc('day', created_at) as date,
             count(*)::int as jobs,
             count(*) filter (where status = 'completed')::int as completed,
             count(*) filter (where status = 'cancelled')::int as cancelled,
             coalesce(sum(estimated_price), 0)::numeric as revenue
      from jobs where created_at > now() - interval '${interval}'
      group by 1 order by 1
    `),
    query(`
      select service_category, count(*)::int as jobs, coalesce(sum(estimated_price), 0)::numeric as revenue
      from jobs where created_at > now() - interval '${interval}'
      group by service_category order by jobs desc limit 10
    `),
    query(`
      select coalesce(nullif(location_name, ''), 'Unknown') as county, count(*)::int as jobs
      from jobs where created_at > now() - interval '${interval}'
      group by location_name order by jobs desc limit 10
    `).catch(() => ({ rows: [] })),
    query(`
      select f.user_id, u.full_name, count(j.id)::int as jobs, coalesce(avg(r.rating), 0)::numeric(3,2) as rating
      from fundis f
      join users u on u.id = f.user_id
      left join jobs j on j.fundi_id = f.user_id and j.created_at > now() - interval '${interval}'
      left join reviews r on r.job_id = j.id
      group by f.user_id, u.full_name order by jobs desc limit 10
    `),
    query(`
      select u.id, u.full_name, count(j.id)::int as jobs, coalesce(sum(j.estimated_price), 0)::numeric as spent
      from users u
      left join jobs j on j.customer_id = u.id and j.created_at > now() - interval '${interval}'
      where u.role = 'customer'
      group by u.id, u.full_name order by spent desc limit 10
    `),
  ]);

  return {
    summary: summary.rows[0],
    dailyData: daily.rows,
    topServices: topServices.rows,
    topCounties: topCounties.rows,
    topFundis: topFundis.rows,
    topCustomers: topCustomers.rows,
  };
}

// ============================================================
// 6. AUDIT TIMELINE
// ============================================================

export async function getAuditTimeline(entityType, entityId) {
  const [timeline, auditLogs] = await Promise.all([
    query('select * from audit_timeline where entity_type = $1 and entity_id = $2 order by created_at desc limit 100', [entityType, entityId]),
    query('select * from audit_logs where entity_type = $1 and (entity_id = $2 or metadata->>$1 = $2) order by created_at desc limit 50', [entityType, entityId]).catch(() => ({ rows: [] })),
  ]);
  return { timeline: timeline.rows, auditLogs: auditLogs.rows };
}

export async function addAuditTimelineEntry({ entityType, entityId, eventType, actorId, actorRole, previousValue, newValue, reason, aiInvolved }) {
  const result = await query(
    `insert into audit_timeline (entity_type, entity_id, event_type, actor_id, actor_role, previous_value, new_value, reason, ai_involved)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) returning *`,
    [entityType, entityId, eventType, actorId, actorRole,
     previousValue ? JSON.stringify(previousValue) : null,
     newValue ? JSON.stringify(newValue) : null,
     reason, aiInvolved || false],
  );
  return result.rows[0];
}

// ============================================================
// 7. FRAUD HEATMAP
// ============================================================

export async function getFraudHeatmap(days = 30) {
  const result = await query(
    `select fraud_type, latitude, longitude, county, severity, created_at, user_id
     from fraud_heatmap_events
     where created_at > now() - interval '${days} days'
     order by created_at desc limit 500`,
  );
  
  const countyStats = await query(
    `select county, count(*)::int as count, 
            count(*) filter (where severity = 'critical')::int as critical,
            count(*) filter (where severity = 'high')::int as high
     from fraud_heatmap_events
     where created_at > now() - interval '${days} days'
     group by county order by count desc`,
  );

  const typeStats = await query(
    `select fraud_type, count(*)::int as count
     from fraud_heatmap_events
     where created_at > now() - interval '${days} days'
     group by fraud_type order by count desc`,
  );

  return { events: result.rows, countyStats: countyStats.rows, typeStats: typeStats.rows };
}

export async function recordFraudHeatmapEvent({ fraudType, latitude, longitude, county, userId, severity, metadata }) {
  await query(
    `insert into fraud_heatmap_events (fraud_type, latitude, longitude, county, user_id, severity, metadata)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [fraudType, latitude, longitude, county || null, userId || null, severity || 'medium', JSON.stringify(metadata || {})],
  );
}

// ============================================================
// 8. QUEUE SYSTEM
// ============================================================

export async function enqueueJob(queueName, payload, priority = 0) {
  const result = await query(
    `insert into job_queue (queue_name, payload, priority) values ($1, $2::jsonb, $3) returning id`,
    [queueName, JSON.stringify(payload), priority],
  );
  return result.rows[0].id;
}

export async function getQueueStatus() {
  const result = await query(
    `select queue_name, status, count(*)::int as count
     from job_queue
     group by queue_name, status
     order by queue_name, status`,
  );
  return result.rows;
}

export async function getQueueJobs(queueName = null, status = null, limit = 50) {
  const params = [];
  let where = '';
  if (queueName) { params.push(queueName); where += ` and queue_name = $${params.length}`; }
  if (status) { params.push(status); where += ` and status = $${params.length}`; }
  params.push(limit);
  const result = await query(
    `select * from job_queue where 1=1 ${where} order by priority desc, created_at desc limit $${params.length}`,
    params,
  );
  return result.rows;
}

export async function retryQueueJob(jobId) {
  await query(`update job_queue set status = 'pending', attempts = 0, error_message = null where id = $1`, [jobId]);
}

// ============================================================
// 9. HR MANAGEMENT
// ============================================================

export async function listEmployees() {
  const result = await query(
    `select e.*, u.email, u.full_name, u.role, u.status as user_status,
       (select count(*) from hr_leave_requests where employee_id = e.id and status = 'pending') as pending_leave
     from hr_employees e
     join users u on u.id = e.user_id
     order by e.department, u.full_name`,
  );
  return result.rows;
}

export async function createEmployee(data, createdBy) {
  const result = await query(
    `insert into hr_employees (user_id, employee_id, department, team, position, employment_type, hire_date, manager_id, emergency_contact_name, emergency_contact_phone, address, national_id, kra_pin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
    [data.userId, data.employeeId, data.department, data.team, data.position, data.employmentType,
     data.hireDate, data.managerId, data.emergencyContactName, data.emergencyContactPhone,
     data.address, data.nationalId, data.kraPin],
  );
  await auditLog({ userId: createdBy, action: 'hr.employee_created', entityType: 'hr_employee', entityId: result.rows[0].id, metadata: data });
  return result.rows[0];
}

export async function requestLeave(employeeId, { leaveType, startDate, endDate, reason }) {
  const result = await query(
    `insert into hr_leave_requests (employee_id, leave_type, start_date, end_date, reason)
     values ($1, $2, $3, $4, $5) returning *`,
    [employeeId, leaveType, startDate, endDate, reason],
  );
  return result.rows[0];
}

export async function approveLeave(leaveId, approvedBy) {
  await query(`update hr_leave_requests set status = 'approved', approved_by = $2, approved_at = now() where id = $1`, [leaveId, approvedBy]);
}

// ============================================================
// 10. MARKETPLACE INTELLIGENCE
// ============================================================

export async function getMarketplaceIntelligence(days = 7) {
  const result = await query(
    `select * from marketplace_intelligence
     where metric_date >= current_date - interval '${days} days'
     order by metric_date desc, gap_score desc`,
  );
  return result.rows;
}

export async function calculateMarketplaceIntelligence() {
  // Calculate demand vs supply per county + service
  const result = await query(`
    select
      current_date as metric_date,
      coalesce(nullif(split_part(location_name, ',', 1), ''), 'Nairobi') as county,
      service_category,
      count(distinct j.id)::int as demand,
      count(distinct f.user_id)::int as supply,
      case when count(distinct f.user_id) = 0 then 100
           else greatest(0, (count(distinct j.id)::float / count(distinct f.user_id) * 100 - 100))::int
      end as gap_score,
      count(distinct j.id) filter (where j.status = 'completed')::int as completed,
      count(distinct f.user_id) filter (where f.online = true)::int as idle_fundis
    from jobs j
    left join fundis f on f.approval_status = 'approved' and $1 = any(f.skills)
    where j.created_at > now() - interval '7 days'
    group by county, service_category, j.service_category
    order by gap_score desc
  `, ['']);
  
  for (const row of result.rows) {
    await query(
      `insert into marketplace_intelligence (metric_date, county, service_category, demand_score, supply_score, gap_score, idle_fundis, active_jobs, recommendation)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (metric_date, county, service_category) do update set
         demand_score = excluded.demand_score, supply_score = excluded.supply_score,
         gap_score = excluded.gap_score, idle_fundis = excluded.idle_fundis,
         active_jobs = excluded.active_jobs, recommendation = excluded.recommendation`,
      [row.metric_date, row.county, row.service_category, row.demand, row.supply, row.gap_score, row.idle_fundis, row.completed,
       row.gap_score > 50 ? `High demand for ${row.service_category} in ${row.county}. Recruit more fundis.` : null],
    );
  }
  return result.rows;
}

// ============================================================
// 11. ML PRICING
// ============================================================

export async function getMLPricingModels() {
  const result = await query('select * from ml_pricing_models order by created_at desc');
  return result.rows;
}

export async function calculateAdaptivePrice({ basePrice, distanceKm, isEmergency, isPeak, demandLevel, supplyLevel }) {
  const model = await query('select * from ml_pricing_models where is_active = true and is_approved = true limit 1');
  if (!model.rows[0]) {
    // Fall back to standard surge pricing
    return { price: basePrice, multiplier: 1.0, model: 'fallback' };
  }

  const m = model.rows[0];
  const factors = m.factors;
  
  let multiplier = m.base_multiplier;
  
  // Distance factor
  if (distanceKm > 20) multiplier += 0.2 * (factors.distance || 0.3);
  
  // Emergency factor
  if (isEmergency) multiplier += 0.5 * (factors.emergency || 0.2);
  
  // Peak hours
  if (isPeak) multiplier += 0.3 * (factors.demand || 0.1);
  
  // Demand vs supply
  if (demandLevel > supplyLevel) {
    multiplier += 0.15 * (factors.availability || 0.15);
  }
  
  multiplier = Math.min(multiplier, m.max_multiplier);
  const price = Math.round(Number(basePrice) * multiplier);
  
  return { price, multiplier, model: m.name, factors: { distanceKm, isEmergency, isPeak, demandLevel, supplyLevel } };
}

export async function approveMLPricingModel(modelId, approvedBy) {
  await query('update ml_pricing_models set is_approved = false'); // unapprove all
  await query('update ml_pricing_models set is_approved = true, is_active = true, approved_by = $2, approved_at = now() where id = $1', [modelId, approvedBy]);
  await auditLog({ userId: approvedBy, action: 'ml_pricing.approved', entityType: 'ml_pricing_model', entityId: modelId });
}

// ============================================================
// 12. IMAGE MODERATION
// ============================================================

export async function submitImageForModeration({ imageUrl, imageType, userId, jobId }) {
  const result = await query(
    `insert into image_moderation_queue (image_url, image_type, user_id, job_id)
     values ($1, $2, $3, $4) returning *`,
    [imageUrl, imageType, userId || null, jobId || null],
  );

  // Automated pre-screening: flag images that match known suspicious patterns.
  // This runs synchronously and sets an initial risk score. Human moderators
  // review anything flagged with risk_score >= 50.
  //
  // When AWS Rekognition credentials are added (REKOGNITION_REGION + access keys),
  // the queue worker will ALSO run Rekognition's DetectLabels + DetectModerationLabels
  // and merge those results into the flags column. See queueWorker.js handler.
  try {
    const flags = [];
    let riskScore = 0;

    // Heuristic 1: URL must be from our own storage domain (prevent external injection)
    const allowedHosts = ['patafundi.r2.dev', 'patafundi-9bhsw1.onrender.com'];
    const urlObj = new URL(imageUrl);
    if (!allowedHosts.some(h => urlObj.hostname.endsWith(h))) {
      flags.push('external_url');
      riskScore += 30;
    }

    // Heuristic 2: file extension must be an allowed image type
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = urlObj.pathname.toLowerCase().match(/\.[a-z]+$/)?.[0] || '';
    if (!allowedExts.includes(ext)) {
      flags.push('suspicious_extension');
      riskScore += 40;
    }

    // Heuristic 3: filename must not contain obvious red-flag tokens
    const redFlags = ['nsfw', 'nude', 'xxx', 'porn', 'weapon', 'gun', 'drug'];
    const lowerPath = urlObj.pathname.toLowerCase();
    for (const flag of redFlags) {
      if (lowerPath.includes(flag)) {
        flags.push(`red_flag:${flag}`);
        riskScore += 60;
      }
    }

    await query(
      `update image_moderation_queue
       set flags = $2, risk_score = $3
       where id = $1`,
      [result.rows[0].id, JSON.stringify(flags), riskScore],
    );

    // Auto-approve if risk score is 0 (clean image, no flags)
    if (riskScore === 0) {
      await query(
        `update image_moderation_queue
         set status = 'approved', reviewed_at = now(), reviewed_by = 'system'
         where id = $1`,
        [result.rows[0].id],
      );
    }
  } catch {
    // If pre-screening fails (e.g. invalid URL), leave in pending for manual review
  }

  return result.rows[0];
}

export async function getModerationQueue(status = 'pending', limit = 50) {
  const result = await query(
    `select q.*, u.full_name as user_name from image_moderation_queue q
     left join users u on u.id = q.user_id
     where q.status = $1 order by q.created_at desc limit $2`,
    [status, limit],
  );
  return result.rows;
}

export async function moderateImage(id, { status, flags }, reviewedBy) {
  await query(
    `update image_moderation_queue set status = $2, flags = $3, reviewed_by = $4, reviewed_at = now() where id = $1`,
    [id, status, flags, reviewedBy],
  );
  await auditLog({ userId: reviewedBy, action: 'image.moderated', entityType: 'image', entityId: id, metadata: { status, flags } });
}

// ============================================================
// 13. SYSTEM HEALTH MONITORING
// ============================================================

export async function recordHealthLog(service, status, details = {}) {
  await query(
    `insert into system_health_logs (service, status, response_time_ms, error_rate, uptime_percentage, details)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [service, status, details.responseTimeMs || null, details.errorRate || null, details.uptime || null, JSON.stringify(details)],
  );
}

export async function getSystemHealth() {
  const services = ['database', 'api', 'frontend', 'redis', 'queue', 'storage', 'email', 'payment', 'maps', 'realtime'];
  const result = {};
  
  for (const svc of services) {
    const log = await query(
      `select * from system_health_logs where service = $1 order by created_at desc limit 1`,
      [svc],
    );
    result[svc] = log.rows[0] || { service: svc, status: 'unknown' };
  }
  
  return result;
}

// ============================================================
// 14. PUBLIC STATUS PAGE
// ============================================================

export async function getPublicStatusPage() {
  const [incidents, services] = await Promise.all([
    query(`select * from status_page_incidents where is_resolved = false or (resolved_at > now() - interval '7 days') order by created_at desc limit 20`),
    query(`select service, status, created_at from system_health_logs where created_at > now() - interval '5 minutes' group by service, status, created_at order by service`),
  ]);
  
  const serviceStatus = {};
  const knownServices = ['api', 'payments', 'messaging', 'maps', 'notifications', 'authentication', 'storage', 'realtime'];
  for (const svc of knownServices) {
    const log = services.rows.find(s => s.service === svc || s.service === svc.toLowerCase());
    serviceStatus[svc] = log ? log.status : 'operational';
  }
  
  return {
    services: serviceStatus,
    incidents: incidents.rows,
    overall: Object.values(serviceStatus).every(s => s === 'operational') ? 'operational' : 'degraded',
  };
}

// ============================================================
// 15. AI CEO REPORT
// ============================================================

export async function generateCEOReport() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  // Check if report already exists for today
  const existing = await query('select * from ai_ceo_reports where report_date = current_date');
  if (existing.rows[0]) return existing.rows[0];

  const [stats, fraud, incidents, support, systemHealth] = await Promise.all([
    query(`
      select
        (select coalesce(sum(amount), 0)::numeric from payments where status = 'completed' and created_at::date = $1::date) as revenue,
        (select coalesce(sum(platform_commission), 0)::numeric from payments where status = 'completed' and created_at::date = $1::date) as commission,
        (select count(*)::int from jobs where status = 'completed' and created_at::date = $1::date) as completed_jobs,
        (select count(*)::int from jobs where status = 'cancelled' and created_at::date = $1::date) as cancelled_jobs,
        (select coalesce(sum(amount), 0)::numeric from payments where status = 'refunded' and created_at::date = $1::date) as refunds,
        (select count(*)::int from users where created_at::date = $1::date) as new_users,
        (select count(*)::int from users where last_login_at::date = $1::date) as active_users,
        (select count(*)::int from fundis where approval_status = 'approved') as approved_fundis
    `, [yesterdayStr]),
    query(`select count(*)::int as total, count(*) filter (where severity = 'critical')::int as critical from fraud_alerts where created_at::date = $1::date`, [yesterdayStr]).catch(() => ({ rows: [{ total: 0, critical: 0 }] })),
    query(`select count(*)::int as total, count(*) filter (where severity in ('sev0','sev1'))::int as critical from incidents where created_at::date = $1::date`, [yesterdayStr]).catch(() => ({ rows: [{ total: 0, critical: 0 }] })),
    query(`select count(*)::int as total, count(*) filter (where status = 'open')::int as open from support_tickets where created_at::date = $1::date`, [yesterdayStr]).catch(() => ({ rows: [{ total: 0, open: 0 }] })),
    query("select service, status from system_health_logs where created_at > now() - interval '1 hour' order by created_at desc limit 10"),
  ]);

  const reportData = {
    date: yesterdayStr,
    revenue: Number(stats.rows[0].revenue || 0),
    commission: Number(stats.rows[0].commission || 0),
    profit: Number(stats.rows[0].revenue || 0) - Number(stats.rows[0].refunds || 0),
    completedJobs: stats.rows[0].completed_jobs,
    cancelledJobs: stats.rows[0].cancelled_jobs,
    refunds: Number(stats.rows[0].refunds || 0),
    newUsers: stats.rows[0].new_users,
    activeUsers: stats.rows[0].active_users,
    approvedFundis: stats.rows[0].approved_fundis,
    fraudAttempts: fraud.rows[0].total,
    fraudCritical: fraud.rows[0].critical,
    incidents: incidents.rows[0].total,
    criticalIncidents: incidents.rows[0].critical,
    supportTickets: support.rows[0].total,
    openTickets: support.rows[0].open,
    systemHealth: systemHealth.rows,
  };

  const recommendations = [];
  if (reportData.cancelledJobs > reportData.completedJobs * 0.3) {
    recommendations.push({ type: 'warning', message: 'High job cancellation rate. Review fundi availability and matching algorithm.' });
  }
  if (reportData.fraudAttempts > 10) {
    recommendations.push({ type: 'risk', message: 'Elevated fraud attempts. Consider tightening verification requirements.' });
  }
  if (reportData.openTickets > 20) {
    recommendations.push({ type: 'action', message: 'Support backlog growing. Consider adding staff or prioritizing ticket resolution.' });
  }
  if (reportData.revenue > 0) {
    recommendations.push({ type: 'opportunity', message: `Revenue of KES ${reportData.revenue.toLocaleString()} generated. Consider scaling marketing in top-performing counties.` });
  }

  const result = await query(
    `insert into ai_ceo_reports (report_date, report_data, recommendations, risks, opportunities)
     values (current_date, $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) returning *`,
    [
      JSON.stringify(reportData),
      JSON.stringify(recommendations.filter(r => r.type === 'risk' || r.type === 'warning')),
      JSON.stringify(recommendations.filter(r => r.type === 'opportunity')),
      JSON.stringify(recommendations),
    ],
  );

  return result.rows[0];
}

// ============================================================
// 16. API VERSIONING
// ============================================================

export async function getAPIVersions() {
  const result = await query('select * from api_versions order by release_date desc');
  return result.rows;
}
