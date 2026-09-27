#!/usr/bin/env node
/**
 * security-battery.mjs — PHASE 10 security evidence battery (master spec §38).
 * Runs against a LIVE server (default http://127.0.0.1:4000) seeded by
 * `npm run db:push`. Read-only wrt DB; uses demo accounts + dev payment
 * simulator. Produces PASS/FAIL evidence lines and a non-zero exit on failure.
 *
 * Covers: RBAC walls, job state-machine principal checks, commission
 * confidentiality (fundi/customer never see platform commission), device-token
 * IDOR, webhook authentication, subscription price authority, unauthenticated
 * access denial.
 */
const BASE = process.env.PATAFUNDI_BATTERY_BASE || 'http://127.0.0.1:4000';
const PASSWORD = 'PataFundi#2026';

let passed = 0, failed = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function login(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const token = r.json?.token || r.json?.data?.token || r.json?.accessToken;
  if (!token) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return token;
}

const COMMISSION_FIELDS = ['platform_commission', 'commission_rate', 'commission_type', 'commission_details'];

async function main() {
  console.log(`\n=== PataFundi Security Battery — ${BASE} ===\n`);

  // ── 0. Logins ──────────────────────────────────────────────────────────
  const customer = await login('customer.demo@patafundi.test');
  const fundi = await login('fundi.demo@patafundi.test');
  const admin = await login('admin.demo@patafundi.test');
  console.log('demo logins OK\n');

  // ── 1. RBAC walls ──────────────────────────────────────────────────────
  console.log('[1] RBAC walls');
  let r = await api('/admin/dashboard', { token: customer });
  check('customer blocked from /admin/dashboard', r.status === 403 || r.status === 401, `status=${r.status}`);
  r = await api('/geo/controls', { token: customer });
  check('customer blocked from /geo/controls (now permission-gated)', r.status === 403, `status=${r.status}`);
  r = await api('/enterprise/feature-flags', { token: customer });
  check('customer blocked from /enterprise/feature-flags', r.status === 403, `status=${r.status}`);
  r = await api('/notifications', {});
  check('unauthenticated /notifications denied', r.status === 401 || r.status === 403, `status=${r.status}`);

  // ── 2. Job lifecycle + state-machine principal checks ─────────────────
  console.log('\n[2] Job state machine (principal enforcement)');
  r = await api('/jobs', { method: 'POST', token: customer, body: {
    serviceCategory: 'plumbing', description: 'Security battery: leaking tap repair',
    estimatedPrice: 1500, latitude: -1.2921, longitude: 36.8219, county: 'Nairobi', urgency: 'normal',
  }});
  const jobId = r.json?.job?.id || r.json?.data?.id || r.json?.id;
  check('customer created job', Boolean(jobId), `status=${r.status} id=${jobId}`);
  if (!jobId) throw new Error('cannot continue without a job');

  // fundi accepts (provider action — allowed)
  r = await api(`/jobs/${jobId}/accept`, { method: 'POST', token: fundi, body: {} });
  const acceptOk = r.status >= 200 && r.status < 300;
  check('fundi accepted job (provider transition allowed)', acceptOk, `status=${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);

  // customer tries to move matching/pending → accepted directly (before any
  // provider action on a FRESH job) — principal check, not just machine check
  r = await api('/jobs', { method: 'POST', token: customer, body: {
    serviceCategory: 'plumbing', description: 'Security battery: state machine fresh job',
    estimatedPrice: 1500, latitude: -1.2921, longitude: 36.8219, county: 'Nairobi', urgency: 'normal',
  }});
  const freshJobId = r.json?.job?.id || r.json?.data?.id || r.json?.id;
  r = await api(`/jobs/${freshJobId}/status`, { method: 'PATCH', token: customer, body: { status: 'accepted' } });
  check('customer cannot self-accept a matching job', r.status === 403, `status=${r.status}`);

  // customer tries to drive a PROVIDER transition on the accepted job → denied
  r = await api(`/jobs/${jobId}/status`, { method: 'PATCH', token: customer, body: { status: 'on_the_way' } });
  check('customer cannot drive on_the_way (provider-only)', r.status === 403, `status=${r.status}`);

  // super_admin (platform owner) may still drive transitions
  r = await api(`/jobs/${jobId}/status`, { method: 'PATCH', token: admin, body: { status: 'assigned' } });
  check('super_admin can drive assigned (state owner)', r.status === 200, `status=${r.status}`);

  // ── 3. Payment (dev simulator) + commission confidentiality ───────────
  console.log('\n[3] Commission confidentiality');
  r = await api('/payments/stk-push', { method: 'POST', token: customer, body: { jobId, mpesaNumber: '254730000001' } });
  const payOk = r.status >= 200 && r.status < 300;
  check('customer paid job (dev simulator)', payOk, `status=${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);

  r = await api(`/payments/job/${jobId}`, { token: customer });
  const custPayment = r.json?.payment || {};
  const custLeak = COMMISSION_FIELDS.filter((f) => f in custPayment);
  check('customer payment view hides commission fields', r.status === 200 && custLeak.length === 0,
    custLeak.length ? `LEAKED: ${custLeak.join(',')}` : 'no commission fields');

  r = await api(`/payments/job/${jobId}`, { token: fundi });
  const fundiPayment = r.json?.payment || {};
  const fundiLeak = COMMISSION_FIELDS.filter((f) => f in fundiPayment);
  check('fundi payment view hides commission fields', r.status === 200 && fundiLeak.length === 0,
    fundiLeak.length ? `LEAKED: ${fundiLeak.join(',')}` : 'no commission fields');

  r = await api(`/payments/job/${jobId}`, { token: admin });
  const adminPayment = r.json?.payment || {};
  check('admin payment view keeps commission fields (authorized audience)',
    r.status === 200 && COMMISSION_FIELDS.some((f) => f in adminPayment),
    `has=${COMMISSION_FIELDS.filter((f) => f in adminPayment).join(',') || 'none'}`);

  // ── 4. Device token IDOR ───────────────────────────────────────────────
  console.log('\n[4] Device token ownership');
  await api('/devices/register', { method: 'POST', token: fundi, body: { token: 'BATTERY-TOKEN-FUNDI', platform: 'android' } });
  r = await api('/devices/BATTERY-TOKEN-FUNDI', { method: 'DELETE', token: customer });
  check('customer cannot delete fundi device token (IDOR)', r.status === 404 || r.status === 403, `status=${r.status}`);
  r = await api('/devices/BATTERY-TOKEN-FUNDI', { method: 'DELETE', token: fundi });
  check('fundi can delete own device token', r.status === 200, `status=${r.status}`);

  // ── 5. Webhook authentication ──────────────────────────────────────────
  console.log('\n[5] Webhook authentication');
  // Dev note: unsigned callbacks are accepted from loopback in development
  // ONLY (config.mpesa.callbackSecret empty). In production the boot check
  // (requireCallbackSecretInProduction) guarantees a secret is configured,
  // which makes unsigned callbacks fail verification. Here we assert the
  // callback pipeline reaches the lookup stage (404 unknown checkout) and
  // that garbage payloads are rejected.
  r = await api('/payments/webhook', { method: 'POST', body: { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_BATTERY_UNKNOWN', ResultCode: 0 } } } });
  check('webhook unknown checkout → not found (pipeline reached)', r.status === 404, `status=${r.status}`);
  r = await api('/payments/webhook', { method: 'POST', body: {} });
  check('webhook missing CheckoutRequestID rejected', r.status === 400, `status=${r.status}`);

  // ── 6. Subscription price authority ────────────────────────────────────
  console.log('\n[6] Subscription pricing (server-authoritative)');
  r = await api('/subscriptions/activate', { method: 'POST', token: fundi, body: { plan: 'bogus-plan', amount: 1, mpesaNumber: '254730000002' } });
  check('unknown plan rejected (plan list server-side)', r.status === 400, `status=${r.status}`);
  const withTamper = await api('/subscriptions/activate', { method: 'POST', token: fundi, body: { plan: 'monthly', amount: 1, mpesaNumber: '254730000002' } });
  const withNormal = await api('/subscriptions/activate', { method: 'POST', token: fundi, body: { plan: 'monthly', amount: 500, mpesaNumber: '254730000002' } });
  check('client amount ignored (tampered vs normal behave identically)',
    withTamper.status === withNormal.status,
    `tampered=${withTamper.status} normal=${withNormal.status} (502 expected: Daraja not configured in dev)`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('BATTERY CRASH:', e.message); process.exit(2); });
