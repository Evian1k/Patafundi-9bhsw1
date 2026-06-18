#!/usr/bin/env node
/**
 * Full E2E user journeys — customer, fundi, admin, all staff roles.
 * Verifies every critical path works end-to-end.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const API = 'http://127.0.0.1:4000';
let cookies = {};
const jars = {};
function saveJar(n) { jars[n] = { ...cookies }; }
function loadJar(n) { cookies = { ...(jars[n] || {}) }; }
function jar(setCookie = []) {
  for (const c of setCookie) {
    const kv = c.split(';', 2)[0];
    const [k, v] = kv.split('=');
    cookies[k.trim()] = v?.trim();
  }
}
function cookieHeader() { return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '); }

function request(method, path, { body, headers = {}, formData = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const reqHeaders = { ...headers };
    let payload = null;
    if (formData) {
      const boundary = '----pf' + crypto.randomBytes(8).toString('hex');
      reqHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      payload = Buffer.concat(formData.map((f) => {
        const head = `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"${f.filename ? `; filename="${f.filename}"` : ''}\r\n${f.contentType ? `Content-Type: ${f.contentType}\r\n` : ''}\r\n`;
        return Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(f.value), Buffer.from('\r\n', 'utf8')]);
      }).concat([Buffer.from(`--${boundary}--\r\n`, 'utf8')]));
    } else if (body) {
      payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (Object.keys(cookies).length) reqHeaders['Cookie'] = cookieHeader();
    if (cookies.csrf_token && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      reqHeaders['x-csrf-token'] = cookies.csrf_token;
    }
    const req = http.request({
      method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: reqHeaders,
    }, (res) => {
      jar(res.headers['set-cookie'] || []);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, body: text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fakeImage() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
}

let pass = 0, fail = 0, bugs = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; bugs.push({ name, detail }); console.log(`  FAIL  ${name}  -- ${detail}`); }
}

async function login(email, password) {
  cookies = {};
  const r = await request('POST', '/api/auth/login', { body: { email, password } });
  return r;
}

async function main() {
  console.log('\n=== PataFundi Full E2E Journey Sweep ===\n');

  // ────────────────────────────────────────────────────────────────
  // 1. All 10 demo logins
  // ────────────────────────────────────────────────────────────────
  console.log('— 1. Demo Logins (all 10 roles) —');
  const logins = [
    ['demo@patafundi.com', 'Demo@2024!', 'customer'],
    ['fundi@patafundi.com', 'Fundi@2024!', 'fundi'],
    ['admin@patafundi.com', 'Admin@2024!', 'super_admin'],
    ['ops@patafundi.com', 'Ops@2024!', 'admin'],
    ['support@patafundi.com', 'Support@2024!', 'support_agent'],
    ['fraud@patafundi.com', 'Fraud@2024!', 'fraud_analyst'],
    ['finance@patafundi.com', 'Finance@2024!', 'finance_team'],
    ['dispatch@patafundi.com', 'Dispatch@2024!', 'dispatch_team'],
    ['devops@patafundi.com', 'Devops@2024!', 'devops_engineer'],
    ['auditor@patafundi.com', 'Auditor@2024!', 'auditor'],
  ];
  for (const [email, pw, expectedRole] of logins) {
    const r = await login(email, pw);
    check(`login ${email} → ${expectedRole}`, r.status === 200 && r.json?.user?.role === expectedRole, `got ${r.status}, role=${r.json?.user?.role}`);
  }

  // ────────────────────────────────────────────────────────────────
  // 2. Customer Journey: register → OTP → login → create job → upload → review
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 2. Customer Journey —');
  cookies = {};
  const custEmail = `e2e-cust-${Date.now()}@x.com`;
  let r = await request('POST', '/api/auth/register', { body: { email: custEmail, password: 'Customer@2024', fullName: 'E2E Customer', phone: '254712000111' } });
  check('customer register', r.status === 201, r.body);
  r = await request('POST', '/api/auth/otp-verify', { body: { email: custEmail, code: r.json.devOtp, purpose: 'register' } });
  check('customer OTP verify', r.status === 200, r.body);
  saveJar('customer');

  loadJar('customer');
  r = await request('GET', '/api/users/me');
  check('customer /users/me', r.status === 200, r.body);

  r = await request('POST', '/api/jobs', {
    body: { serviceCategory: 'plumbing', description: 'Leaky tap', formattedAddress: 'Westlands', latitude: -1.2676, longitude: 36.8108, estimatedPrice: 1500 },
  });
  check('customer create job', r.status === 201, r.body);
  const jobId = r.json?.job?.id;
  saveJar('customer');

  loadJar('customer');
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: fakeImage(), filename: 'tap.png', contentType: 'image/png' }],
  });
  check('customer upload job photos', r.status === 201, r.body);
  r = await request('GET', `/api/jobs/${jobId}/photos`);
  check('customer list job photos', r.status === 200, r.body);
  saveJar('customer');

  // ────────────────────────────────────────────────────────────────
  // 3. Fundi Journey: public register → upload ID/selfie → OTP → pending → admin approve → accept job
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 3. Fundi Journey —');
  cookies = {};
  const fundiEmail = `e2e-fundi-${Date.now()}@x.com`;
  r = await request('POST', '/api/auth/register/fundi', {
    formData: [
      { name: 'email', value: fundiEmail },
      { name: 'password', value: 'Fundi@2024' },
      { name: 'fullName', value: 'E2E Fundi' },
      { name: 'phone', value: '254712000222' },
      { name: 'skills', value: JSON.stringify(['plumbing']) },
      { name: 'idPhoto', value: fakeImage(), filename: 'id.png', contentType: 'image/png' },
      { name: 'idPhotoBack', value: fakeImage(), filename: 'idb.png', contentType: 'image/png' },
      { name: 'selfiePhoto', value: fakeImage(), filename: 'selfie.png', contentType: 'image/png' },
    ],
  });
  check('fundi public register', r.status === 201, r.body);
  const fundiId = r.json?.fundiId;
  r = await request('POST', '/api/auth/otp-verify', { body: { email: fundiEmail, code: r.json.devOtp, purpose: 'register' } });
  check('fundi OTP verify', r.status === 200, r.body);
  check('fundi role is fundi_pending', r.json?.user?.role === 'fundi_pending', JSON.stringify(r.json?.user));
  saveJar('fundi_pending');

  // Pending fundi CANNOT accept jobs
  loadJar('fundi_pending');
  r = await request('POST', `/api/jobs/${jobId}/accept`);
  check('pending fundi cannot accept job (403)', r.status === 403, `got ${r.status}`);
  r = await request('POST', '/api/fundi/location', { body: { latitude: -1.28, longitude: 36.81 } });
  check('pending fundi cannot update location (403)', r.status === 403, `got ${r.status}`);

  // ────────────────────────────────────────────────────────────────
  // 4. Admin Journey: login → approve fundi → view fraud → manage jobs
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 4. Admin Journey —');
  cookies = {};
  r = await request('POST', '/api/auth/login', { body: { email: 'admin@patafundi.com', password: 'Admin@2024!' } });
  check('super_admin login', r.status === 200 && r.json?.user?.role === 'super_admin', r.body);
  saveJar('admin');

  loadJar('admin');
  r = await request('GET', '/api/admin/fraud/dashboard');
  check('admin fraud dashboard', r.status === 200, r.body);
  r = await request('GET', '/api/admin/fraud/alerts');
  check('admin fraud alerts', r.status === 200, r.body);
  r = await request('GET', '/api/admin/fraud/debts');
  check('admin fraud debts', r.status === 200, r.body);
  r = await request('GET', '/api/admin/fraud/suspicious-jobs');
  check('admin fraud suspicious-jobs', r.status === 200, r.body);
  r = await request('GET', '/api/admin/revenue');
  check('admin revenue', r.status === 200, r.body);
  r = await request('GET', '/api/admin/jobs');
  check('admin jobs list', r.status === 200, r.body);
  r = await request('GET', '/api/admin/customers');
  check('admin customers list', r.status === 200, r.body);
  r = await request('GET', '/api/admin/fundis');
  check('admin fundis list', r.status === 200, r.body);

  // Approve the fundi
  r = await request('GET', `/api/admin/fundis/${fundiId}`);
  check('admin get fundi by id', r.status === 200, r.body);
  r = await request('POST', `/api/admin/fundis/${fundiId}/approve`);
  check('admin approve fundi', r.status === 200, r.body);
  saveJar('admin');

  // ────────────────────────────────────────────────────────────────
  // 5. Approved Fundi: accept job → check-in → complete
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 5. Approved Fundi Journey —');
  loadJar('fundi_pending');
  r = await request('GET', '/api/fundi/approval-status');
  check('fundi approval_status = approved', r.json?.fundi?.approval_status === 'approved', JSON.stringify(r.json));

  r = await request('POST', `/api/jobs/${jobId}/accept`);
  check('approved fundi accepts job', r.status === 200, r.body);
  r = await request('GET', '/api/jobs/fundi/active');
  check('fundi active job', r.status === 200, r.body);
  r = await request('POST', '/api/fundi/location', { body: { latitude: -1.28, longitude: 36.81, jobId } });
  check('fundi location update', r.status === 200, r.body);
  r = await request('POST', `/api/jobs/${jobId}/check-in`, { body: { latitude: -1.26, longitude: 36.81, status: 'on_the_way' } });
  check('fundi check-in', r.status === 200, r.body);
  r = await request('PATCH', `/api/jobs/${jobId}/status`, { body: { status: 'in_progress' } });
  check('fundi start work', r.status === 200, r.body);
  r = await request('POST', `/api/jobs/${jobId}/complete`, { body: {} });
  check('fundi complete job', r.status === 200, r.body);
  saveJar('fundi_approved');

  // ────────────────────────────────────────────────────────────────
  // 6. RBAC: staff role isolation
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 6. RBAC Staff Role Isolation —');
  loadJar('support');
  // Re-login support
  cookies = {};
  await request('POST', '/api/auth/login', { body: { email: 'support@patafundi.com', password: 'Support@2024!' } });
  saveJar('support');
  loadJar('support');
  r = await request('GET', '/api/staff/me/permissions');
  check('support_agent lists own permissions', r.status === 200 && Array.isArray(r.json?.permissions), r.body);
  r = await request('GET', '/api/staff/disputes');
  check('support_agent can view disputes', r.status === 200, r.body);
  r = await request('GET', '/api/staff/payments');
  check('support_agent CANNOT view payments (403)', r.status === 403, `got ${r.status}`);
  r = await request('GET', '/api/admin/roles');
  check('support_agent CANNOT manage roles (403)', r.status === 403, `got ${r.status}`);

  // Finance team
  cookies = {};
  await request('POST', '/api/auth/login', { body: { email: 'finance@patafundi.com', password: 'Finance@2024!' } });
  saveJar('finance');
  loadJar('finance');
  r = await request('GET', '/api/staff/payments');
  check('finance_team can view payments', r.status === 200, r.body);
  r = await request('GET', '/api/staff/disputes');
  check('finance_team CANNOT view disputes (403)', r.status === 403, `got ${r.status}`);

  // Auditor (read-only)
  cookies = {};
  await request('POST', '/api/auth/login', { body: { email: 'auditor@patafundi.com', password: 'Auditor@2024!' } });
  saveJar('auditor');
  loadJar('auditor');
  r = await request('GET', '/api/staff/audit-logs');
  check('auditor can view audit logs', r.status === 200, r.body);
  r = await request('POST', '/api/staff/fundis/00000000-0000-0000-0000-000000000001/approve');
  check('auditor CANNOT approve fundis (403)', r.status === 403, `got ${r.status}`);

  // ────────────────────────────────────────────────────────────────
  // 7. Security: privilege escalation attempts
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 7. Security: Privilege Escalation —');
  // Customer tries admin route
  loadJar('customer');
  r = await request('GET', '/api/admin/dashboard');
  check('customer CANNOT access admin dashboard (403)', r.status === 403, `got ${r.status}`);
  // Fundi tries admin route
  loadJar('fundi_approved');
  r = await request('GET', '/api/admin/dashboard');
  check('fundi CANNOT access admin dashboard (403)', r.status === 403, `got ${r.status}`);
  // Register with role=admin
  cookies = {};
  r = await request('POST', '/api/auth/register', { body: { email: `evil-${Date.now()}@x.com`, password: 'Evil@1234', fullName: 'Evil', role: 'admin' } });
  check('register with role=admin rejected (403)', r.status === 403, `got ${r.status}`);
  // Forged JWT
  const forged = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'super_admin', roles: ['super_admin'] })).toString('base64url') + '.' +
    'invalid';
  cookies = {};
  r = await request('GET', '/api/admin/dashboard', { headers: { Authorization: `Bearer ${forged}` } });
  check('forged super_admin JWT rejected (401/403)', r.status === 401 || r.status === 403, `got ${r.status}`);

  // ────────────────────────────────────────────────────────────────
  // 8. Map visibility: only approved fundis in search
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 8. Map Visibility —');
  cookies = {};
  r = await request('GET', '/api/fundi/search');
  check('public fundi search works', r.status === 200, r.body);
  const searchFundis = r.json?.fundis || [];
  const allApproved = searchFundis.every(f => f.approvalStatus === 'approved' || f.verified);
  check('all search results are approved fundis', allApproved || searchFundis.length === 0, `found non-approved: ${searchFundis.filter(f => !f.approvalStatus && !f.verified).length}`);

  // ────────────────────────────────────────────────────────────────
  // 9. Storage security
  // ────────────────────────────────────────────────────────────────
  console.log('\n— 9. Storage Security —');
  loadJar('customer');
  r = await request('GET', '/api/storage/local/' + encodeURIComponent('../../../etc/passwd'));
  check('path traversal blocked', r.status === 403 || r.status === 400, `got ${r.status}`);
  // Customer cannot fetch verification docs
  loadJar('admin');
  r = await request('GET', `/api/admin/verification-documents/${fundiId}`);
  check('admin can fetch verification docs', r.status === 200, r.body);
  loadJar('customer');
  r = await request('GET', `/api/admin/verification-documents/${fundiId}`);
  check('customer CANNOT fetch verification docs (403)', r.status === 403, `got ${r.status}`);

  // ────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────
  console.log('\n=== E2E Journey Summary ===');
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  console.log(`Total:  ${pass + fail}\n`);
  if (bugs.length) {
    console.log('Bugs found:');
    for (const b of bugs) console.log(`  - ${b.name}: ${b.detail}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
