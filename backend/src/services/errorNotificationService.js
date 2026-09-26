/**
 * Error Notification Service
 *
 * Logs errors to the database and routes notifications to the staff roles
 * responsible for handling them. Users only ever see a friendly message and
 * a short reference code (e.g. ERR-7F3K2Q); the full technical detail lives
 * here, in error_logs, and in the staff error-log viewer.
 *
 * Error routing (server-authoritative):
 *   - system / database / rate_limit → super_admin + devops_engineer
 *   - security (401/403 spikes, authz failures) → super_admin + fraud_analyst
 *   - payment (M-Pesa, settlement, payout) → super_admin + finance_team
 *   - fraud (blocked/suspicious activity) → super_admin + fraud_analyst
 *   - client (frontend crashes reported via /api/client-errors) → super_admin + devops_engineer
 *   - general → super_admin
 *
 * Anti-spam: identical errors (same type + path + message) are NOT re-notified
 * within a 10-minute window — they are still logged to error_logs so nothing
 * is lost, but staff are not flooded with duplicates.
 */
import { query } from '../db.js';
import { logNonFatal, swallow } from '../utils/logError.js';

const ERROR_STAFF_ROLES = {
  system: ['super_admin', 'devops_engineer'],
  security: ['super_admin', 'fraud_analyst'],
  payment: ['super_admin', 'finance_team'],
  database: ['super_admin', 'devops_engineer'],
  rate_limit: ['super_admin', 'devops_engineer'],
  fraud: ['super_admin', 'fraud_analyst'],
  client: ['super_admin', 'devops_engineer'],
  general: ['super_admin'],
};

const DEDUPE_WINDOW_MINUTES = 10;

/**
 * Log an error and notify relevant staff.
 * Called from the global error handler in server.js and from
 * POST /api/client-errors (frontend crash reports).
 */
export async function logErrorAndNotifyStaff({
  type = 'general',
  statusCode = 500,
  message,
  stack,
  reference = null,
  path,
  method,
  userId = null,
  userRole = null,
  ip = null,
  userAgent = null,
  source = 'server',
}) {
  try {
    // 1. Make sure the error_logs table has the columns this version writes
    //    (reference, source, user_role). Safe to run on every deploy.
    await ensureErrorLogsColumns().catch(swallow('errorNotify.ensureColumns'));

    // 2. Decide notification eligibility BEFORE inserting the row — the dedupe
    //    query fingerprints error_logs rows, and the row we are about to insert
    //    must not suppress its own notification.
    const shouldNotify = shouldNotifyStaff(type, statusCode);
    const isDuplicate = shouldNotify ? await recentlyNotified(type, path, message) : false;

    // 3. Insert into error_logs — the permanent, queryable record.
    //    Every error is logged, whether or not staff get pinged.
    try {
      await query(
        `insert into error_logs (error_type, status_code, message, stack_trace, path, method, user_id, ip_address, user_agent, reference, source, user_role, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
        [
          type, statusCode, message?.slice(0, 1000), stack?.slice(0, 5000) || null,
          path || null, method || null, userId, ip, userAgent?.slice(0, 500) || null,
          reference, source, userRole,
        ],
      );
    } catch {
      // error_logs table might not exist yet — create it, then retry
      await createErrorLogsTable();
      await query(
        `insert into error_logs (error_type, status_code, message, stack_trace, path, method, user_id, ip_address, user_agent, reference, source, user_role, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
        [
          type, statusCode, message?.slice(0, 1000), stack?.slice(0, 5000) || null,
          path || null, method || null, userId, ip, userAgent?.slice(0, 500) || null,
          reference, source, userRole,
        ],
      ).catch(swallow('errorNotify.insertRetry'));
    }

    // 4. Skip notification for insignificant errors (404/400/401) or recent
    //    duplicates — the row above is still logged, only the ping is suppressed.
    if (!shouldNotify || isDuplicate) return;

    // 5. Find staff users with the roles responsible for this error type
    const rolesToNotify = ERROR_STAFF_ROLES[type] || ERROR_STAFF_ROLES.general;
    const staffResult = await query(
      `select id from users where role = any($1) and status = 'active'`,
      [rolesToNotify],
    );
    if (staffResult.rows.length === 0) return;

    // 6. Create one notification per staff member
    const severity = getSeverity(statusCode);
    const title = `[${severity}] ${type.toUpperCase()} error ${reference ? reference : ''} — ${statusCode} on ${method || 'GET'} ${path || '/'}`.trim();
    const notificationBody = formatErrorMessage({ type, statusCode, message, path, method, reference, userRole, source });

    for (const staff of staffResult.rows) {
      try {
        await query(
          `insert into notifications (user_id, type, title, body, data)
           values ($1, 'error_alert', $2, $3, $4::jsonb)`,
          [
            staff.id,
            title,
            notificationBody,
            JSON.stringify({ type, statusCode, path, method, reference, source, timestamp: new Date().toISOString() }),
          ],
        );
      } catch (error) {
        logNonFatal('errorNotify.notifyStaff', error, { staffId: staff.id });
      }
    }

    // 7. Permanent audit record (auditor-visible, immutable trail)
    try {
      await query(
        `insert into audit_logs (user_id, action, entity_type, entity_id, metadata, created_at)
         values ($1, 'system.error', 'error', null, $2::jsonb, now())`,
        [userId, JSON.stringify({ type, statusCode, message: message?.slice(0, 500), path, method, ip, reference, source })],
      );
    } catch (error) {
      logNonFatal('errorNotify.auditLog', error, { type, statusCode });
    }
  } catch (err) {
    // Never let error logging crash the request
    console.error('[errorNotify] failed to log error:', err.message);
  }
}

async function ensureErrorLogsColumns() {
  await query(`alter table error_logs add column if not exists reference text`);
  await query(`alter table error_logs add column if not exists source text not null default 'server'`);
  await query(`alter table error_logs add column if not exists user_role text`);
  await query(`create index if not exists idx_error_logs_reference on error_logs (reference)`);
  await query(`create index if not exists idx_error_logs_dedupe on error_logs (error_type, path, created_at)`);
}

async function createErrorLogsTable() {
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
      reference text,
      source text not null default 'server',
      user_role text,
      created_at timestamptz not null default now()
    )`,
  );
  await ensureErrorLogsColumns().catch(swallow('errorNotify.ensureColumnsAfterCreate'));
}

async function recentlyNotified(type, path, message) {
  try {
    const result = await query(
      `select 1 from error_logs
       where error_type = $1
         and coalesce(path, '') = coalesce($2, '')
         and left(message, 300) = left($3, 300)
         and created_at > now() - interval '${DEDUPE_WINDOW_MINUTES} minutes'
         and $1 in ('system', 'database', 'payment', 'security', 'rate_limit', 'fraud', 'client')
       limit 1`,
      [type, path || '', message || ''],
    );
    // If an earlier row with the same fingerprint exists, the FIRST one already
    // notified staff (it passed this check), so suppress this duplicate.
    return result.rows.length > 0;
  } catch {
    return false; // on failure, prefer notifying over staying silent
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
  // - 500/502/503 — system bugs or outages
  // - database errors — service down
  // - payment errors — money is involved
  // - client-reported crashes — frontend broken for real users
  if (statusCode === 500 || statusCode === 502 || statusCode === 503) return true;
  if (type === 'database' || type === 'payment' || type === 'client') return true;
  return false;
}

function getSeverity(statusCode) {
  if (statusCode >= 500) return 'CRITICAL';
  if (statusCode >= 400) return 'WARNING';
  return 'INFO';
}

function formatErrorMessage({ type, statusCode, message, path, method, reference, userRole, source }) {
  const lines = [
    `${type.toUpperCase()} error (${statusCode}) on ${method || 'GET'} ${path || '/'}`,
    '',
    `Reference: ${reference || 'n/a'}`,
    `Source: ${source}`,
    userRole ? `User role: ${userRole}` : null,
    '',
    message || 'No message',
    '',
    `Timestamp: ${new Date().toISOString()}`,
    'View: Staff Portal → DevOps → Error Logs (filter by this reference).',
  ];
  return lines.filter((line) => line !== null).join('\n');
}
