/**
 * Data Retention Service — automated cleanup per Data Retention Policy
 * Runs daily via setInterval. Deletes/anonymizes data past retention period.
 */
import { query } from '../db.js';

const RETENTION_POLICIES = {
  // Chat messages: 90 days after job completion
  chat_messages: { days: 90, action: 'delete', condition: 'created_at < now() - interval \'90 days\'' },
  // OTP codes: 24 hours
  otp_codes: { days: 1, action: 'delete', condition: 'expires_at < now()' },
  // Refresh tokens: 30 days after expiry
  refresh_tokens: { days: 30, action: 'delete', condition: 'expires_at < now() - interval \'30 days\'' },
  // Audit logs: 3 years (1095 days) — kept for legal compliance
  // Error logs: 90 days
  error_logs: { days: 90, action: 'delete', condition: 'created_at < now() - interval \'90 days\'' },
  // GPS history: 30 days
  gps_history: { days: 30, action: 'delete', condition: 'created_at < now() - interval \'30 days\'' },
  // Staff login history: 1 year
  staff_login_history: { days: 365, action: 'delete', condition: 'created_at < now() - interval \'365 days\'' },
  // Liveness sessions: 1 year
  liveness_sessions: { days: 365, action: 'delete', condition: 'created_at < now() - interval \'365 days\'' },
};

export async function runDataRetentionCleanup() {
  const results = [];
  for (const [table, policy] of Object.entries(RETENTION_POLICIES)) {
    try {
      const result = await query(`delete from ${table} where ${policy.condition}`);
      if (result.rowCount > 0) {
        console.log(`[retention] cleaned ${result.rowCount} rows from ${table}`);
        results.push({ table, deleted: result.rowCount });
      }
    } catch (err) {
      console.warn(`[retention] could not clean ${table}:`, err.message);
    }
  }

  // Also anonymize inactive users (12 months inactivity)
  try {
    const inactive = await query(
      `update users set
         email = 'inactive_' || substring(id::text, 1, 8) || '@inactive.local',
         phone = null,
         full_name = 'Inactive User',
         password_hash = 'inactive',
         status = 'inactive'
       where status = 'active'
         and last_login_at < now() - interval '365 days'
         and role not in ('super_admin', 'admin', 'ops_manager', 'support_agent', 'fraud_analyst', 'finance_team', 'dispatch_team', 'devops_engineer', 'auditor')
       returning id`,
    );
    if (inactive.rowCount > 0) {
      console.log(`[retention] anonymized ${inactive.rowCount} inactive users`);
      results.push({ table: 'users_anonymized', deleted: inactive.rowCount });
    }
  } catch (err) {
    console.warn('[retention] could not anonymize inactive users:', err.message);
  }

  return results;
}
