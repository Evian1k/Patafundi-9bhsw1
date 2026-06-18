#!/usr/bin/env node
/**
 * PataFundi end-to-end audit.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const API = process.env.API_URL || 'http://127.0.0.1:4000';
const results = [];
let passCount = 0;
let failCount = 0;
let cookies = {};
// Per-user cookie snapshots so we can switch identities cleanly.
const userJars = {};

function saveJar(name) { userJars[name] = { ...cookies }; }
function loadJar(name) { cookies = { ...(userJars[name] || {}) }; }

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
      const boundary = '----patafundi' + crypto.randomBytes(8).toString('hex');
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
    // CSRF: every mutating request must echo the csrf_token cookie value as a header.
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
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
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

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) { passCount += 1; console.log(`  PASS  ${name}`); }
  else { failCount += 1; console.log(`  FAIL  ${name}  -- ${detail}`); }
}

function fakeImage() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
}

async function main() {
  console.log('\n=== PataFundi E2E audit ===');
  console.log(`Target: ${API}\n`);

  console.log('-- Healthcheck --');
  const h = await request('GET', '/health');
  check('GET /health returns 200', h.status === 200, `got ${h.status}`);
  check('DB is healthy', h.json?.database?.ok === true, JSON.stringify(h.json?.database));

  console.log('\n-- Customer onboarding --');
  const customerEmail = `cust-${Date.now()}@patafundi-test.com`;
  let r = await request('POST', '/api/auth/register', {
    body: { email: customerEmail, password: 'Customer@2024', fullName: 'Test Customer', phone: '254712000111' },
  });
  check('POST /api/auth/register returns 201', r.status === 201, `got ${r.status}: ${r.body}`);
  check('register returns otpRequired=true', r.json?.otpRequired === true, JSON.stringify(r.json));

  const otp = r.json?.devOtp;
  r = await request('POST', '/api/auth/otp-verify', { body: { email: customerEmail, code: otp, purpose: 'register' } });
  check('POST /api/auth/otp-verify returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  check('otp-verify sets access_token cookie', Boolean(cookies.access_token), 'no access_token cookie');
  check('otp-verify sets csrf_token cookie', Boolean(cookies.csrf_token), 'no csrf_token cookie');
  saveJar('customer');
  const customerUser = r.json?.user;
  check('verified customer role is customer', customerUser?.role === 'customer', JSON.stringify(customerUser));

  r = await request('GET', '/api/users/me');
  check('GET /api/users/me returns 200', r.status === 200, `got ${r.status}`);

  console.log('\n-- Fundi PUBLIC onboarding --');
  cookies = {}; // fresh browser, no auth
  const fundiEmail = `fundi-${Date.now()}@patafundi-test.com`;
  const fundiForm = [
    { name: 'email', value: fundiEmail },
    { name: 'password', value: 'Fundi@2024' },
    { name: 'fullName', value: 'Test Fundi' },
    { name: 'phone', value: '254712000222' },
    { name: 'skills', value: JSON.stringify(['plumbing']) },
    { name: 'experience', value: '5 years' },
    { name: 'idNumber', value: '12345678' },
    { name: 'latitude', value: '-1.2864' },
    { name: 'longitude', value: '36.8172' },
    { name: 'idPhoto', value: fakeImage(), filename: 'id-front.png', contentType: 'image/png' },
    { name: 'idPhotoBack', value: fakeImage(), filename: 'id-back.png', contentType: 'image/png' },
    { name: 'selfiePhoto', value: fakeImage(), filename: 'selfie.png', contentType: 'image/png' },
  ];
  r = await request('POST', '/api/auth/register/fundi', { formData: fundiForm });
  check('POST /api/auth/register/fundi (PUBLIC) returns 201', r.status === 201, `got ${r.status}: ${r.body}`);
  check('fundi register returns otpRequired=true', r.json?.otpRequired === true, JSON.stringify(r.json));
  const fundiId = r.json?.fundiId;
  check('fundi register returns fundiId', Boolean(fundiId), JSON.stringify(r.json));

  const fundiOtp = r.json?.devOtp;
  r = await request('POST', '/api/auth/otp-verify', { body: { email: fundiEmail, code: fundiOtp, purpose: 'register' } });
  check('fundi OTP verify returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  const fundiUser = r.json?.user;
  check('fundi user role is fundi_pending', fundiUser?.role === 'fundi_pending', JSON.stringify(fundiUser));
  saveJar('fundi_pending');

  console.log('\n-- Pending fundi cannot accept jobs --');
  loadJar('customer');
  r = await request('POST', '/api/jobs', {
    body: { serviceCategory: 'plumbing', description: 'Leaky kitchen tap', formattedAddress: 'Westlands, Nairobi', latitude: -1.2676, longitude: 36.8108, estimatedPrice: 1500 },
  });
  check('customer creates job', r.status === 201, `got ${r.status}: ${r.body}`);
  const jobId = r.json?.job?.id;
  check('job id present', Boolean(jobId), JSON.stringify(r.json));
  saveJar('customer');

  loadJar('fundi_pending');
  r = await request('POST', `/api/jobs/${jobId}/accept`);
  check('pending fundi accept returns 403 (not 500)', r.status === 403, `got ${r.status}: ${r.body}`);
  check('403 message mentions pending/approval/review', /pending|approval|review/i.test(r.json?.message || ''), JSON.stringify(r.json));

  r = await request('GET', '/api/jobs/fundi/active');
  check('pending fundi GET /api/jobs/fundi/active returns 403', r.status === 403, `got ${r.status}: ${r.body}`);
  check('403 message mentions pending/approval/review', /pending|approval|review/i.test(r.json?.message || ''), JSON.stringify(r.json));

  r = await request('POST', '/api/fundi/location', { body: { latitude: -1.2864, longitude: 36.8172 } });
  check('pending fundi POST /api/fundi/location returns 403', r.status === 403, `got ${r.status}: ${r.body}`);
  saveJar('fundi_pending');

  console.log('\n-- Admin approval flow --');
  cookies = {};
  r = await request('POST', '/api/auth/login', { body: { email: 'admin@patafundi.com', password: 'Admin@2024!' } });
  check('admin login returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  check('admin role returned', r.json?.user?.role === 'admin', JSON.stringify(r.json?.user));
  saveJar('admin');

  console.log('\n-- Fraud dashboard endpoints --');
  for (const path of ['/api/admin/fraud/dashboard', '/api/admin/fraud/alerts', '/api/admin/fraud/debts', '/api/admin/fraud/suspicious-jobs']) {
    r = await request('GET', path);
    check(`GET ${path} returns 200`, r.status === 200, `got ${r.status}: ${r.body}`);
  }

  r = await request('GET', `/api/admin/fundis/${fundiId}`);
  check('admin GET /api/admin/fundis/:id returns 200', r.status === 200, `got ${r.status}: ${r.body}`);

  r = await request('POST', `/api/admin/fundis/${fundiId}/approve`);
  check('admin POST /api/admin/fundis/:id/approve returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  check('fundi approval_status is approved', r.json?.fundi?.approval_status === 'approved', JSON.stringify(r.json?.fundi));
  saveJar('admin');

  loadJar('fundi_pending'); // same fundi, now approved in DB
  r = await request('GET', '/api/fundi/approval-status');
  check('fundi GET /api/fundi/approval-status returns approved', r.json?.fundi?.approval_status === 'approved', JSON.stringify(r.json));

  console.log('\n-- Approved fundi can now work --');
  loadJar('fundi_pending');
  r = await request('POST', `/api/jobs/${jobId}/accept`);
  check('approved fundi POST /api/jobs/:id/accept returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  check('job status is accepted', r.json?.job?.status === 'accepted', JSON.stringify(r.json?.job?.status));

  r = await request('GET', '/api/jobs/fundi/active');
  check('approved fundi GET /api/jobs/fundi/active returns 200', r.status === 200, `got ${r.status}: ${r.body}`);

  r = await request('POST', '/api/fundi/location', { body: { latitude: -1.2864, longitude: 36.8172, jobId } });
  check('approved fundi POST /api/fundi/location returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  saveJar('fundi_approved');

  console.log('\n-- Storage access (Step 6) --');
  loadJar('admin');
  r = await request('GET', `/api/admin/verification-documents/${fundiId}`);
  check('admin GET verification-documents returns 200', r.status === 200, `got ${r.status}: ${r.body}`);
  const docs = r.json?.documents || [];
  check('verification_documents has 3+ entries (id_front, id_back, selfie)', docs.length >= 3, `got ${docs.length} docs`);

  loadJar('fundi_approved');
  r = await request('GET', `/api/admin/verification-documents/${fundiId}`);
  check('fundi GET verification-documents returns 403', r.status === 403, `got ${r.status}: ${r.body}`);

  loadJar('customer');
  r = await request('GET', `/api/admin/verification-documents/${fundiId}`);
  check('customer GET verification-documents returns 403', r.status === 403, `got ${r.status}: ${r.body}`);

  r = await request('GET', `/api/jobs/${jobId}/photos`);
  check('customer (job owner) GET job photos returns 200', r.status === 200, `got ${r.status}: ${r.body}`);

  // ---------------------------------------------------------------
  // 6b. Local-storage IDOR hardening (Step 6 follow-up)
  // ---------------------------------------------------------------
  console.log('\n-- Local-storage IDOR hardening --');
  // Customer should NOT be able to fetch another user's verification docs
  // via the local-storage fallback path (when R2 is not configured).
  // The dev server uses local fallback — perfect for verifying this control.
  const fakeFundiId = crypto.randomUUID();
  r = await request('GET', `/api/storage/local/verification/${fakeFundiId}/id-front.webp`);
  check('customer cannot fetch verification file via local storage', r.status === 403, `got ${r.status}: ${r.body}`);

  // Path traversal attempt — must be URL-encoded so Express doesn't normalize it.
  r = await request('GET', `/api/storage/local/${encodeURIComponent('../../../etc/passwd')}`);
  check('path traversal via .. is blocked', r.status === 403 || r.status === 400, `got ${r.status}: ${r.body}`);

  console.log('\n-- Security: JWT forgery / privilege escalation --');
  const forgedToken = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ sub: customerUser?.id, role: 'admin', email: 'x@x.com', roles: ['admin'] })).toString('base64url') + '.' +
    'invalidSignature';
  cookies = {};
  r = await request('GET', '/api/admin/dashboard', { headers: { Authorization: `Bearer ${forgedToken}` } });
  check('forged admin JWT is rejected', r.status === 401 || r.status === 403, `got ${r.status}: ${r.body}`);

  loadJar('customer');
  r = await request('GET', '/api/admin/dashboard');
  check('customer GET /api/admin/dashboard returns 403', r.status === 403, `got ${r.status}: ${r.body}`);

  loadJar('fundi_approved');
  r = await request('GET', '/api/admin/dashboard');
  check('fundi GET /api/admin/dashboard returns 403', r.status === 403, `got ${r.status}: ${r.body}`);

  cookies = {};
  r = await request('POST', '/api/auth/register', { body: { email: `evil-admin-${Date.now()}@x.com`, password: 'EvilAdmin@1', fullName: 'Evil', role: 'admin' } });
  check('register with role=admin is rejected', r.status === 403, `got ${r.status}: ${r.body}`);

  console.log('\n-- CSRF protection --');
  // Take the customer's jar, drop only the csrf header — server should reject.
  loadJar('customer');
  const savedCsrf = cookies.csrf_token;
  delete cookies.csrf_token;
  r = await request('POST', '/api/jobs', { body: { serviceCategory: 'plumbing', description: 'CSRF test' } });
  check('CSRF: POST without csrf_token is rejected', r.status === 403, `got ${r.status}: ${r.body}`);
  cookies.csrf_token = savedCsrf;

  console.log('\n-- Realtime auth --');
  r = await request('GET', '/socket.io/?EIO=4&transport=polling');
  check('socket.io polling handshake reachable', r.status === 200, `got ${r.status}`);

  console.log('\n-- Job lifecycle completion --');
  loadJar('fundi_approved');
  r = await request('PATCH', `/api/jobs/${jobId}/status`, { body: { status: 'in_progress' } });
  check('fundi PATCH job status -> in_progress', r.status === 200, `got ${r.status}: ${r.body}`);

  r = await request('POST', `/api/jobs/${jobId}/complete`, { body: {} });
  check('fundi POST /jobs/:id/complete returns 200', r.status === 200, `got ${r.status}: ${r.body}`);

  console.log('\n=== Summary ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total:  ${results.length}\n`);

  fs.writeFileSync('/home/z/my-project/download/E2E_RESULTS.json', JSON.stringify({ pass: passCount, fail: failCount, results }, null, 2));
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(2); });
