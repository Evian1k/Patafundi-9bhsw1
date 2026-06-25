/**
 * Enterprise Service — Disaster Recovery, GDPR, Productivity, Messaging, Emergency Controls
 */
import { query } from '../db.js';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { auditLog } from './auditService.js';

const execAsync = promisify(exec);

// ============================================================
// DISASTER RECOVERY — Backups
// ============================================================

export async function createBackup(type = 'full', initiatedBy) {
  const result = await query(
    `insert into backup_logs (backup_type, status, initiated_by, started_at)
     values ($1, 'running', $2, now()) returning id`,
    [type, initiatedBy],
  );
  const backupId = result.rows[0].id;

  try {
    // Use pg_dump to create a backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${type}-${timestamp}.sql`;
    const backupDir = process.env.BACKUP_DIR || '/tmp/patafundi-backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filepath = path.join(backupDir, filename);

    const dbUrl = process.env.DATABASE_URL;
    const { stdout, stderr } = await execAsync(`pg_dump "${dbUrl}" > "${filepath}"`, { timeout: 120000 });

    const stats = fs.statSync(filepath);
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');

    await query(
      `update backup_logs set status = 'completed', backup_size_bytes = $2, storage_location = $3,
       checksum = $4, completed_at = now() where id = $1`,
      [backupId, stats.size, filepath, checksum],
    );

    await auditLog({ userId: initiatedBy, action: 'backup.created', entityType: 'backup', entityId: backupId, metadata: { type, filename, size: stats.size } });

    return { backupId, filename, size: stats.size, checksum };
  } catch (err) {
    await query(
      `update backup_logs set status = 'failed', error_message = $2, completed_at = now() where id = $1`,
      [backupId, err.message],
    );
    throw err;
  }
}

export async function listBackups(limit = 50) {
  const result = await query(
    `select * from backup_logs order by created_at desc limit $1`,
    [limit],
  );
  return result.rows;
}

export async function restoreBackup(backupId, initiatedBy) {
  const backup = await query('select * from backup_logs where id = $1', [backupId]);
  if (!backup.rows[0]) throw new Error('Backup not found');
  if (backup.rows[0].status !== 'completed') throw new Error('Backup not in completed state');
  if (!fs.existsSync(backup.rows[0].storage_location)) throw new Error('Backup file not found');

  await auditLog({ userId: initiatedBy, action: 'backup.restore_started', entityType: 'backup', entityId: backupId, metadata: { location: backup.rows[0].storage_location } });
  // Note: Actual restore is destructive — log it but require manual execution
  return { message: 'Restore requires manual execution. Backup file located at: ' + backup.rows[0].storage_location, backupId };
}

// ============================================================
// GDPR — Data Export & Deletion
// ============================================================

export async function requestDataExport(userId) {
  // Collect all user data
  const tables = ['users', 'jobs', 'payments', 'reviews', 'notifications', 'chat_messages',
    'referrals', 'referral_rewards', 'otp_codes', 'audit_logs', 'user_loyalty',
    'favorite_fundis', 'saved_places', 'support_tickets', 'disputes'];

  const userData = {};
  for (const table of tables) {
    try {
      const result = await query(`select * from ${table} where user_id = $1 or customer_id = $1 or referrer_id = $1 or referee_id = $1 or sender_id = $1 limit 1000`, [userId]);
      if (result.rows.length > 0) userData[table] = result.rows;
    } catch { /* table might not have user_id column */ }
  }

  // Also get fundi-specific data
  try {
    const fundiData = await query('select * from fundis where user_id = $1', [userId]);
    if (fundiData.rows[0]) userData.fundis = fundiData.rows;
  } catch {}

  const result = await query(
    `insert into gdpr_requests (user_id, request_type, status, details, processed_by, processed_at, expires_at)
     values ($1, 'data_export', 'completed', $2::jsonb, $1, now(), now() + interval '30 days')
     returning id`,
    [userId, JSON.stringify({ tableCount: Object.keys(userData).length, exportedAt: new Date().toISOString() })],
  );

  await auditLog({ userId, action: 'gdpr.data_export', entityType: 'user', entityId: userId });
  return { requestId: result.rows[0].id, data: userData };
}

export async function requestDataDeletion(userId, reason) {
  const result = await query(
    `insert into gdpr_requests (user_id, request_type, status, details)
     values ($1, 'data_deletion', 'pending', $2::jsonb) returning id`,
    [userId, JSON.stringify({ reason, requestedAt: new Date().toISOString() })],
  );

  await auditLog({ userId, action: 'gdpr.deletion_requested', entityType: 'user', entityId: userId, metadata: { reason } });
  return { requestId: result.rows[0].id, message: 'Deletion request submitted. Will be processed within 30 days per Kenya DPA.' };
}

export async function processDataDeletion(requestId, processedBy) {
  const req = await query('select * from gdpr_requests where id = $1 and request_type = $2', [requestId, 'data_deletion']);
  if (!req.rows[0]) throw new Error('GDPR request not found');

  const userId = req.rows[0].user_id;

  // Soft-delete: mark user as deleted, anonymize PII
  await query(
    `update users set
       email = 'deleted_' || $2 || '@deleted.local',
       full_name = 'Deleted User',
       phone = null,
       password_hash = 'deleted',
       status = 'deleted',
       updated_at = now()
     where id = $1`,
    [userId, userId.substring(0, 8)],
  );

  // Revoke all sessions
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);

  // Mark request as completed
  await query(
    `update gdpr_requests set status = 'completed', processed_by = $2, processed_at = now() where id = $1`,
    [requestId, processedBy],
  );

  await auditLog({ userId: processedBy, action: 'gdpr.deletion_completed', entityType: 'user', entityId: userId });
  return { message: 'User data anonymized and account deleted.' };
}

// ============================================================
// STAFF PRODUCTIVITY
// ============================================================

export async function recordStaffAction(staffId, department, action, value = 1) {
  const today = new Date().toISOString().split('T')[0];
  const columnMap = {
    ticket_resolved: 'tickets_resolved',
    payment_processed: 'payments_processed',
    refund_handled: 'refunds_handled',
    job_assigned: 'jobs_assigned',
    failed_assignment: 'failed_assignments',
    fraud_case_reviewed: 'fraud_cases_reviewed',
    suspension_issued: 'suspensions_issued',
    false_positive: 'false_positives',
    incident_resolved: 'incidents_resolved',
    deployment_made: 'deployments_made',
    escalation_handled: 'escalations_handled',
  };

  const column = columnMap[action];
  if (!column) return;

  await query(
    `insert into staff_productivity_metrics (staff_id, date, department, ${column})
     values ($1, $2, $3, $4)
     on conflict (staff_id, date)
     do update set ${column} = staff_productivity_metrics.${column} + $4, updated_at = now()`,
    [staffId, today, department, value],
  );
}

export async function getStaffProductivity(staffId, days = 30) {
  const result = await query(
    `select * from staff_productivity_metrics
     where staff_id = $1 and date >= current_date - interval '${days} days'
     order by date desc`,
    [staffId],
  );
  return result.rows;
}

export async function getDepartmentProductivity(department, days = 30) {
  const result = await query(
    `select staff_id, users.full_name, users.email,
       sum(tickets_resolved) as total_tickets,
       avg(avg_response_time_minutes) as avg_response_time,
       sum(escalations_handled) as total_escalations,
       avg(customer_rating) as avg_rating,
       sum(payments_processed) as total_payments,
       sum(refunds_handled) as total_refunds,
       sum(revenue_collected) as total_revenue,
       sum(jobs_assigned) as total_jobs,
       sum(failed_assignments) as total_failed,
       sum(fraud_cases_reviewed) as total_fraud_cases,
       sum(suspensions_issued) as total_suspensions,
       sum(false_positives) as total_false_positives,
       sum(incidents_resolved) as total_incidents,
       sum(deployments_made) as total_deployments
     from staff_productivity_metrics
     join users on users.id = staff_productivity_metrics.staff_id
     where department = $1 and date >= current_date - interval '${days} days'
     group by staff_id, users.full_name, users.email
     order by total_tickets desc, total_payments desc`,
    [department],
  );
  return result.rows;
}

export async function getAllStaffProductivity(days = 30) {
  const result = await query(
    `select staff_id, users.full_name, users.email, users.role,
       spm.department,
       sum(tickets_resolved) as total_tickets,
       sum(payments_processed) as total_payments,
       sum(revenue_collected) as total_revenue,
       sum(jobs_assigned) as total_jobs,
       sum(fraud_cases_reviewed) as total_fraud_cases,
       sum(incidents_resolved) as total_incidents
     from staff_productivity_metrics spm
     join users on users.id = spm.staff_id
     where spm.date >= current_date - interval '${days} days'
     group by staff_id, users.full_name, users.email, users.role, spm.department
     order by total_tickets desc, total_payments desc`,
  );
  return result.rows;
}

// ============================================================
// INTERNAL MESSAGING
// ============================================================

export async function listChannels(userId, role) {
  // All staff can see department + announcement + emergency channels
  const result = await query(
    `select * from internal_channels
     where type in ('announcement', 'emergency')
        or (type = 'department' and department is not null)
     order by type, name`,
  );
  return result.rows;
}

export async function sendMessage(senderId, { channelId, recipientId, message, isEmergency = false, attachmentUrl = null }) {
  const result = await query(
    `insert into internal_messages (channel_id, sender_id, recipient_id, message, attachment_url, is_emergency)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [channelId || null, senderId, recipientId || null, message, attachmentUrl, isEmergency],
  );

  // If emergency, notify all staff
  if (isEmergency) {
    const staff = await query(`select id from users where role in ('super_admin','admin','ops_manager','support_agent','fraud_analyst','finance_team','dispatch_team','devops_engineer','auditor') and status = 'active'`);
    for (const s of staff.rows) {
      await query(
        `insert into notifications (user_id, type, title, message, data)
         values ($1, 'emergency_alert', 'EMERGENCY ALERT', $2, $3::jsonb)`,
        [s.id, message.substring(0, 500), JSON.stringify({ senderId, messageId: result.rows[0].id })],
      );
    }
  }

  return result.rows[0];
}

export async function getChannelMessages(channelId, limit = 50) {
  const result = await query(
    `select im.*, u.full_name as sender_name, u.role as sender_role
     from internal_messages im
     join users u on u.id = im.sender_id
     where im.channel_id = $1
     order by im.created_at desc limit $2`,
    [channelId, limit],
  );
  return result.rows.reverse();
}

export async function getDirectMessages(userId, otherUserId, limit = 50) {
  const result = await query(
    `select im.*, u.full_name as sender_name, u.role as sender_role
     from internal_messages im
     join users u on u.id = im.sender_id
     where (im.sender_id = $1 and im.recipient_id = $2)
        or (im.sender_id = $2 and im.recipient_id = $1)
     order by im.created_at desc limit $3`,
    [userId, otherUserId, limit],
  );
  return result.rows.reverse();
}

export async function markMessageRead(messageId, userId) {
  await query('update internal_messages set read_at = now() where id = $1 and recipient_id = $2', [messageId, userId]);
}

// ============================================================
// EMERGENCY CONTROLS
// ============================================================

const EMERGENCY_CONTROLS = {
  maintenance_mode: { flag: 'maintenance_mode', label: 'Maintenance Mode' },
  disable_payments: { flag: 'payments', label: 'Disable Payments' },
  disable_registrations: { flag: 'new_registrations_enabled', label: 'Disable Registrations' },
  disable_fundi_signups: { flag: 'fundi_signups', label: 'Disable Fundi Signups' },
  disable_chat: { flag: 'chat', label: 'Disable Chat' },
  disable_ai: { flag: 'ai', label: 'Disable AI' },
  disable_referrals: { flag: 'referrals', label: 'Disable Referrals' },
};

export async function getEmergencyControlStatus() {
  const flags = await query('select key, is_enabled from feature_flags');
  const status = {};
  for (const [control, config] of Object.entries(EMERGENCY_CONTROLS)) {
    const flag = flags.rows.find(f => f.key === config.flag);
    // For "disable_*" controls, the feature flag being OFF means the control is ON
    // For maintenance_mode, the flag being ON means the control is ON
    if (control === 'maintenance_mode') {
      status[control] = { label: config.label, active: flag?.is_enabled === true };
    } else if (control.startsWith('disable_')) {
      // For disable_payments, payments flag = false means payments disabled = control active
      // For disable_registrations, new_registrations_enabled = false means control active
      // For disable_fundi_signups, fundi_signups flag doesn't exist yet — default to not active
      if (control === 'disable_registrations') {
        status[control] = { label: config.label, active: flag?.is_enabled === false };
      } else {
        status[control] = { label: config.label, active: flag?.is_enabled === false };
      }
    }
  }
  return status;
}

export async function toggleEmergencyControl(control, action, reason, initiatedBy) {
  const config = EMERGENCY_CONTROLS[control];
  if (!config) throw new Error(`Unknown emergency control: ${control}`);

  const enable = action === 'enable';
  // For maintenance_mode: enable=true means set flag to true
  // For disable_*: enable=true means set the underlying feature flag to false
  const flagValue = control === 'maintenance_mode' ? enable : !enable;

  await query(
    `insert into feature_flags (key, label, is_enabled, category, updated_by, updated_at)
     values ($1, $2, $3, 'emergency', $4, now())
     on conflict (key) do update set is_enabled = excluded.is_enabled, updated_by = excluded.updated_by, updated_at = now()`,
    [config.flag, config.label, flagValue, initiatedBy],
  );

  await query(
    `insert into emergency_control_logs (control_type, action, reason, initiated_by)
     values ($1, $2, $3, $4)`,
    [control, enable ? 'enabled' : 'disabled', reason, initiatedBy],
  );

  await auditLog({
    userId: initiatedBy,
    action: `emergency.${control}_${enable ? 'enabled' : 'disabled'}`,
    entityType: 'feature_flag',
    entityId: config.flag,
    metadata: { reason, control },
  });

  // Notify all staff
  const staff = await query(`select id from users where role in ('super_admin','admin','ops_manager','support_agent','fraud_analyst','finance_team','dispatch_team','devops_engineer','auditor') and status = 'active'`);
  for (const s of staff.rows) {
    await query(
      `insert into notifications (user_id, type, title, message, data)
       values ($1, 'emergency_control', $2, $3, $4::jsonb)`,
      [s.id, `EMERGENCY: ${config.label} ${enable ? 'ACTIVATED' : 'DEACTIVATED'}`,
       `Control: ${config.label}\nAction: ${enable ? 'Enabled' : 'Disabled'}\nReason: ${reason || 'No reason provided'}\nBy: Staff ID ${initiatedBy}`,
       JSON.stringify({ control, action, reason })],
    );
  }

  return { control, action: enable ? 'enabled' : 'disabled', flagValue };
}

// ============================================================
// CATEGORY COMMISSIONS
// ============================================================

export async function getCategoryCommissions() {
  const result = await query('select * from commission_overrides order by category');
  return result.rows;
}

export async function updateCategoryCommission(category, rate, region = null, updatedBy) {
  const result = await query(
    `insert into commission_overrides (category, commission_rate, region, is_active, created_by)
     values ($1, $2, $3, true, $4)
     on conflict (category, region)
     do update set commission_rate = excluded.commission_rate, updated_at = now()
     returning *`,
    [category, rate, region, updatedBy],
  );

  await auditLog({
    userId: updatedBy,
    action: 'commission.override_updated',
    entityType: 'commission_override',
    entityId: result.rows[0].id,
    metadata: { category, rate, region },
  });

  return result.rows[0];
}

// ============================================================
// STAFF LIFECYCLE — Password Reset, Force Logout, Require 2FA
// ============================================================

export async function resetStaffPassword(staffId, newPassword, resetBy) {
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(newPassword, 12);
  await query('update users set password_hash = $2, must_reset_password = true, updated_at = now() where id = $1', [staffId, hash]);
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [staffId]);
  await auditLog({ userId: resetBy, action: 'staff.password_reset', entityType: 'user', entityId: staffId });
  return { message: 'Password reset. Staff must login with new password.' };
}

export async function forceLogoutUser(userId, forcedBy) {
  const result = await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null returning id', [userId]);
  await auditLog({ userId: forcedBy, action: 'staff.force_logout', entityType: 'user', entityId: userId, metadata: { sessionsRevoked: result.rowCount } });
  return { message: `Force logout complete. ${result.rowCount} sessions revoked.` };
}

export async function require2FA(userId, required, requiredBy) {
  await query('update users set must_setup_2fa = $2 where id = $1', [userId, required]);
  await auditLog({ userId: requiredBy, action: 'staff.require_2fa', entityType: 'user', entityId: userId, metadata: { required } });
  return { message: `2FA ${required ? 'required' : 'no longer required'} for user.` };
}

// ============================================================
// MONITORING — Health Check
// ============================================================

export async function getSystemHealth() {
  const [dbHealth, apiHealth, storageHealth, paymentHealth] = await Promise.all([
    query('select count(*)::int as users, count(*) filter (where status = $1)::int as active from users', ['active']),
    query('select count(*)::int as jobs, count(*) filter (where status = $1)::int as active_jobs from jobs', ['matching']),
    query('select count(*)::int as payments, coalesce(sum(amount), 0)::numeric as total_revenue from payments where status = $1', ['completed']),
    query('select count(*)::int as open_disputes from disputes where status = $1', ['open']),
  ]);

  return {
    database: { users: dbHealth.rows[0].users, activeUsers: dbHealth.rows[0].active },
    jobs: { total: apiHealth.rows[0].jobs, active: apiHealth.rows[0].active_jobs },
    payments: { count: storageHealth.rows[0].payments, revenue: Number(storageHealth.rows[0].total_revenue) },
    disputes: { open: paymentHealth.rows[0].open_disputes },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };
}
