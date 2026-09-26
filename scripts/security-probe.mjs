// Security spot-check battery (spec §31) — runs against localhost:4000
const BASE = 'http://localhost:4000/api';
let pass = 0, fail = 0;
const check = (name, ok, detail='') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const api = async (path, { method='GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const login = async (email, password='FundiHub#2026') => (await api('/auth/login', { method:'POST', body:{ email, password } })).json?.token;

const customer = await login('customer.demo@fundihub.test');
const fundi = await login('fundi.demo@fundihub.test');
const admin = await login('admin.demo@fundihub.test');
const company = await login('company.demo@fundihub.test');

// 1. IDOR: customer reads another user's job (nonexistent uuid → 404, not leak)
const r1 = await api('/jobs/00000000-0000-4000-8000-000000000000', { token: customer });
check('IDOR: unknown job → 404', r1.status === 404, `got ${r1.status}`);

// 2. Tenant isolation: company A user cannot act on company B resources — portal scope check
const portal = await api('/company/portal/overview', { token: fundi });
check('tenant: fundi blocked from company portal', portal.status === 403, `got ${portal.status}`);

// 3. Admin surface: customer blocked
const adm = await api('/admin/dashboard-stats', { token: customer });
check('admin: customer blocked', adm.status === 403, `got ${adm.status}`);

// 4. Staff-only endpoint with customer token
const st = await api('/staff/me/permissions', { token: customer });
check('staff permissions: customer gets empty list (no leak)', st.status === 200 && Array.isArray(st.json?.permissions) && st.json.permissions.length === 0, `perms=${st.json?.permissions?.length}`);

// 5. Invalid token rejected
const bad = await api('/users/me', { token: 'eyJhbGciOiJIUzI1NiJ9.tampered.token' });
check('auth: tampered token rejected', bad.status === 401 || bad.status === 403, `got ${bad.status}`);

// 6. No-token rejected
const none = await api('/users/me');
check('auth: missing token rejected', none.status === 401 || none.status === 403, `got ${none.status}`);

// 7. Wrong-role app guard: fundi token on customer quality endpoints etc.
const q = await api('/fundi/00000000-0000-4000-8000-000000000000/quality', { token: customer });
check('quality: customer blocked from fundi quality (unknown id)', q.status === 403 || q.status === 404, `got ${q.status}`);

// 8. Completion code: fundi cannot fetch customer's confirmation code
const jobs = await api('/jobs', { token: customer });
const job = (jobs.json?.jobs || []).find(j => j.status === 'completed');
if (job) {
  const cc = await api(`/jobs/${job.id}/completion-code`, { method: 'POST', token: fundi });
  check('completion-code: fundi blocked', cc.status === 403 || cc.status === 400, `got ${cc.status}`);
  const cc2 = await api(`/jobs/${job.id}/completion-code`, { method: 'POST', token: customer });
  check('completion-code: customer authorized (re-issue or already-confirmed)', cc2.status === 200 || cc2.status === 400, `got ${cc2.status}`);
} else {
  console.log('ℹ no completed job available for completion-code probe (skipped)');
}

// 9. Pricing calculate: customer response has NO commission internals
const pc = await api('/pricing/calculate', { method: 'POST', token: customer, body: { serviceCategory: 'plumbing' } });
const pkeys = Object.keys(pc.json?.price || {});
check('pricing: commission stripped for customers', !pkeys.includes('commissionPercent') && !pkeys.includes('fundiEarnings'), `keys=${pkeys.join(',')}`);

// 10. Payment: client cannot mark payment successful (no trust in frontend state)
const fakePay = await api(`/payments/process/00000000-0000-4000-8000-000000000000`, { method: 'POST', token: customer, body: { status: 'success' } });
check('payment: client cannot declare success', [400,403,404,405].includes(fakePay.status), `got ${fakePay.status}`);

// 11. Webhook without secret rejected in this environment? (loopback allowed only when not production — verify signature enforcement exists)
const wh = await api('/payments/webhook', { method: 'POST', body: { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_FAKE', ResultCode: 0 } } } });
check('webhook: unknown checkout id not processed as success', wh.status !== 200 || wh.json?.processed !== true, `got ${wh.status}`);

// 12. Rate limiting on auth (20/15min) — fire 25 rapid failures
let limited = false;
for (let i = 0; i < 25; i++) {
  const r = await api('/auth/login', { method: 'POST', body: { email: 'ratelimit-probe@fundihub.test', password: 'wrong' } });
  if (r.status === 429) { limited = true; break; }
}
check('rate-limit: login brute force throttled', limited);

// 13. Chat policy: cancelled jobs block messaging
const allJobs = (jobs.json?.jobs || []);
const cancelled = allJobs.find(j => j.status === 'cancelled');
if (cancelled) {
  const cm = await api(`/jobs/${cancelled.id}/messages`, { method: 'POST', token: customer, body: { body: 'post-cancel hello' } });
  check('chat: cancelled job messaging blocked', cm.status === 403, `got ${cm.status}`);
} else {
  console.log('ℹ no cancelled job for chat probe (skipped)');
}

// 14. Client error intake issues a reference
const ce = await api('/client-errors', { method: 'POST', body: { message: 'TypeError: probe', stack: 'probe', path: '/probe', userAgent: 'probe' } });
check('client-errors: intake returns reference', ce.status === 202 && /ERR-/.test(ce.json?.reference || ''), `ref=${ce.json?.reference}`);

// 15. Staff error-logs: customer blocked
const el = await api('/staff/error-logs', { token: customer });
check('error-logs: customer blocked', el.status === 403, `got ${el.status}`);

console.log(`\n═══ SECURITY PROBE: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
