/**
 * Error Notification Service
 *
 * Logs errors to the database and creates notifications for staff members
 * who are responsible for handling errors.
 *
 * Error routing:
 *   - 5xx errors → super_admin + devops_engineer (system errors)
 *   - 403/401 errors → super_admin + security (auth/security issues)
 *   - Payment errors → super_admin + finance_team
 *   - Database errors → super_admin + devops_engineer
 *   - Rate limit errors → super_admin + devops_engineer
 */
import { query } from '../db.js';

const ERROR_STAFF_ROLES = {
  system: ['super_admin', 'devops_engineer'],
  security: ['super_admin', 'fraud_analyst'],
  payment: ['super_admin', 'finance_team'],
  database: ['super_admin', 'devops_engineer'],
  rate_limit: ['super_admin', 'devops_engineer'],
  general: ['super_admin'],
};

/**
 * Log an error and notify relevant staff.
 * Called from the global error handler in server.js.
 */
export async function logErrorAndNotifyStaff({
  type = 'general',
  statusCode = 500,
  message,
  stack,
  path,
  method,
  userId = null,
  ip = null,
  userAgent = null,
}) {
  try {
    // 1. Insert into error_logs table (if it exists)
    try {
      await query(
        `insert into error_logs (error_type, status_code, message, stack_trace, path, method, user_id, ip_address, user_agent, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [type, statusCode, message?.slice(0, 1000), stack?.slice(0, 5000) || null, path || null, method || null, userId, ip, userAgent?.slice(0, 500) || null],
      );
    } catch {
      // error_logs table might not exist — create it
      await query(
        `create table if not exists error_logs (
          id uuid primary key default gen_random_uuid(),
          error_type text not null,
          status_code integer not null,
          message text not null,
          stack_trace text,
          path text,
          method text,
          user_id uuid,
          ip_address text,
          user_agent text,
          resolved boolean not null default false,
          resolved_by uuid,
          resolved_at timestamptz,
          created_at timestamptz not null default now()
        )`,
      );
      // Retry insert
      await query(
        `insert into error_logs (error_type, status_code, message, stack_trace, path, method, user_id, ip_address, user_agent, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [type, statusCode, message?.slice(0, 1000), stack?.slice(0, 5000) || null, path || null, method || null, userId, ip, userAgent?.slice(0, 500) || null],
      ).catch(() => {});
    }

    // 2. Only notify staff for significant errors (not every 404 or 401)
    const shouldNotify = shouldNotifyStaff(type, statusCode);
    if (!shouldNotify) return;

    // 3. Determine which staff roles should be notified
    const rolesToNotify = ERROR_STAFF_ROLES[type] || ERROR_STAFF_ROLES.general;

    // 4. Find staff users with those roles
    const staffResult = await query(
      `select id from users where role = any($1) and status = 'active'`,
      [rolesToNotify],
    );

    if (staffResult.rows.length === 0) return;

    // 5. Create notifications for each staff member
    const severity = getSeverity(statusCode);
    const title = `[${severity}] ${type.toUpperCase()} Error — ${statusCode}`;
    const notificationBody = formatErrorMessage(type, statusCode, message, path, method);

    for (const staff of staffResult.rows) {
      try {
        await query(
          `insert into notifications (user_id, type, title, message, data)
           values ($1, 'error_alert', $2, $3, $4::jsonb)`,
          [
            staff.id,
            title,
            notificationBody,
            JSON.stringify({ type, statusCode, path, method, timestamp: new Date().toISOString() }),
          ],
        );
      } catch {
        // notifications table might have different schema — ignore
      }
    }

    // 6. Also log to audit_logs for permanent record
    try {
      await query(
        `insert into audit_logs (user_id, action, entity_type, entity_id, metadata, created_at)
         values ($1, 'system.error', 'error', null, $2::jsonb, now())`,
        [userId, JSON.stringify({ type, statusCode, message: message?.slice(0, 500), path, method, ip })],
      );
    } catch { /* ignore */ }

  } catch (err) {
    // Never let error logging crash the request
    console.error('[errorNotify] failed to log error:', err.message);
  }
}

function shouldNotifyStaff(type, statusCode) {
  // Don't notify for:
  // - 404 (not found) — normal behavior
  // - 400 (bad request) — user error, not system error
  // - 401 (unauthorized) — normal auth flow
  // - 429 (rate limited) — expected during attacks
  //
  // DO notify for:
  // - 500 (internal server error) — system bug
  // - 503 (service unavailable) — system down
  // - 403 spikes (possible attack) — but only log, don't notify every one
  // - Database errors
  // - Payment errors
  if (statusCode === 500 || statusCode === 502 || statusCode === 503) return true;
  if (type === 'database' || type === 'payment') return true;
  return false;
}

function getSeverity(statusCode) {
  if (statusCode >= 500) return 'CRITICAL';
  if (statusCode >= 400) return 'WARNING';
  return 'INFO';
}

function formatErrorMessage(type, statusCode, message, path, method) {
  return `${type.toUpperCase()} error (${statusCode}) on ${method || 'GET'} ${path || '/'}\n\n${message || 'No message'}\n\nTimestamp: ${new Date().toISOString()}`;
}
