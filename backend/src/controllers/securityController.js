/**
 * Security Controller — 2FA, feature flags, account sessions, API integrations, favorites.
 */
import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import {
  setup2FA, verify2FASetup, verify2FALogin, disable2FA, regenerateRecoveryCodes,
  getAllFeatureFlags, setFeatureFlag,
} from '../services/securityService.js';

// ── 2FA ──
export async function setup2FAReq(req, res) {
  const result = await setup2FA(req.user.id);
  res.json({ success: true, ...result });
}

export async function verify2FASetupReq(req, res) {
  const { token } = req.body || {};
  if (!token) throw badRequest('Token is required');
  const result = await verify2FASetup(req.user.id, token);
  await auditLog({ userId: req.user.id, action: 'security.2fa_enabled', entityType: 'user', entityId: req.user.id });
  res.json({ success: true, ...result });
}

export async function disable2FAReq(req, res) {
  await disable2FA(req.user.id);
  await auditLog({ userId: req.user.id, action: 'security.2fa_disabled', entityType: 'user', entityId: req.user.id });
  res.json({ success: true });
}

export async function regenerateRecoveryReq(req, res) {
  const codes = await regenerateRecoveryCodes(req.user.id);
  await auditLog({ userId: req.user.id, action: 'security.recovery_codes_regenerated', entityType: 'user', entityId: req.user.id });
  res.json({ success: true, recoveryCodes: codes });
}

// ── Feature Flags ──
export async function listFeatureFlags(_req, res) {
  const flags = await getAllFeatureFlags();
  res.json({ success: true, flags });
}

export async function toggleFeatureFlag(req, res) {
  const { key, enabled } = req.body || {};
  if (!key || typeof enabled !== 'boolean') throw badRequest('key and enabled (boolean) required');
  await setFeatureFlag(key, enabled, req.user.id);
  await auditLog({ userId: req.user.id, action: 'system.feature_flag', entityType: 'feature_flag', entityId: key, metadata: { enabled } });
  res.json({ success: true, key, enabled });
}

// ── Session Management ──
export async function getActiveSessions(req, res) {
  const result = await query(
    'select id, token_hash, expires_at, created_at from refresh_tokens where user_id = $1 and revoked_at is null and expires_at > now() order by created_at desc',
    [req.user.id],
  );
  res.json({ success: true, sessions: result.rows });
}

export async function terminateSession(req, res) {
  await query('update refresh_tokens set revoked_at = now() where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  res.json({ success: true });
}

export async function terminateAllSessions(req, res) {
  await query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [req.user.id]);
  res.json({ success: true });
}

// ── Login History ──
export async function getLoginHistory(req, res) {
  const result = await query(
    `select id, ip_address, user_agent, success, failure_reason, created_at
     from staff_login_history where user_id = $1 order by created_at desc limit 50`,
    [req.user.id],
  );
  res.json({ success: true, history: result.rows });
}

// ── Favorite Fundis ──
export async function listFavoriteFundis(req, res) {
  const result = await query(
    `select ff.fundi_id as fundi_user_id, u.full_name, u.email, f2.skills, f2.rating, f2.approval_status,
            ff.created_at as favorited_at
     from favorite_fundis ff
     join users u on u.id = ff.fundi_id
     left join fundis f2 on f2.user_id = ff.fundi_id
     where ff.customer_id = $1
     order by ff.created_at desc`,
    [req.user.id],
  );
  res.json({ success: true, favorites: result.rows });
}

export async function addFavoriteFundi(req, res) {
  const { fundiId } = req.body || {};
  if (!fundiId) throw badRequest('fundiId is required');
  await query(
    'insert into favorite_fundis (customer_id, fundi_id) values ($1, $2) on conflict do nothing',
    [req.user.id, fundiId],
  );
  res.status(201).json({ success: true });
}

export async function removeFavoriteFundi(req, res) {
  await query('delete from favorite_fundis where customer_id = $1 and fundi_id = $2', [req.user.id, req.params.fundiId]);
  res.json({ success: true });
}

// ── API Integrations ──
export async function listApiIntegrations(_req, res) {
  const result = await query('select * from api_integrations order by label');
  res.json({ success: true, integrations: result.rows });
}

export async function testApiIntegration(req, res) {
  const { service } = req.params;
  const valid = await query('select * from api_integrations where service = $1', [service]);
  if (!valid.rows[0]) throw notFound('Integration not found');

  // Check if env vars are configured for this service
  const envMap = {
    google_maps: ['VITE_GOOGLE_MAPS_API_KEY'],
    daraja: ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE'],
    resend: ['RESEND_API_KEY'],
    cloudflare_r2: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
    redis: ['REDIS_URL'],
    firebase: ['FCM_SERVER_KEY'],
    gemini: ['GEMINI_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    claude: ['ANTHROPIC_API_KEY'],
    stripe: ['STRIPE_SECRET_KEY'],
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    africas_talking: ['AT_API_KEY', 'AT_USERNAME'],
    smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
  };

  const requiredVars = envMap[service] || [];
  const missing = requiredVars.filter((v) => !process.env[v]);
  const isConfigured = missing.length === 0;

  await query(
    'update api_integrations set is_configured = $2, is_connected = $2, last_health_check = now(), last_error = $3 where service = $1',
    [service, isConfigured, missing.length ? `Missing: ${missing.join(', ')}` : null],
  );

  res.json({
    success: true,
    service,
    configured: isConfigured,
    connected: isConfigured,
    missing: missing.length ? missing : undefined,
  });
}
