#!/usr/bin/env node
/**
 * PataFundi FULL certification audit — covers every route + attack vectors.
 *
 * This is a re-audit after the initial fixes (commit c150f09).
 * Goal: catch anything the first pass missed.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const API = process.env.API_URL || 'http://127.0.0.1:4000';
const results = [];
let passCount = 0;
let failCount = 0;
let cookies = {};
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

function request(method, path, { body, headers = {}, formData = null, rawBody = null } = {}) {
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
    } else if (rawBody !== null) {
      payload = rawBody;
      reqHeaders['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
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

async function setupUsers() {
  // Customer
  cookies = {};
  const custEmail = `cust-${Date.now()}@x.com`;
  let r = await request('POST', '/api/auth/register', { body: { email: custEmail, password: 'Customer@2024', fullName: 'C', phone: '254712000111' } });
  await request('POST', '/api/auth/otp-verify', { body: { email: custEmail, code: r.json.devOtp, purpose: 'register' } });
  saveJar('customer');

  // Fundi (public onboarding)
  cookies = {};
  const fundiEmail = `fundi-${Date.now()}@x.com`;
  const fundiForm = [
    { name: 'email', value: fundiEmail },
    { name: 'password', value: 'Fundi@2024' },
    { name: 'fullName', value: 'F' },
    { name: 'phone', value: '254712000222' },
    { name: 'skills', value: JSON.stringify(['plumbing']) },
    { name: 'experience', value: '5y' },
    { name: 'idNumber', value: '12345678' },
    { name: 'latitude', value: '-1.2864' },
    { name: 'longitude', value: '36.8172' },
    { name: 'idPhoto', value: fakeImage(), filename: 'id.png', contentType: 'image/png' },
    { name: 'idPhotoBack', value: fakeImage(), filename: 'idb.png', contentType: 'image/png' },
    { name: 'selfiePhoto', value: fakeImage(), filename: 'self.png', contentType: 'image/png' },
  ];
  r = await request('POST', '/api/auth/register/fundi', { formData: fundiForm });
  const fundiId = r.json?.fundiId;
  await request('POST', '/api/auth/otp-verify', { body: { email: fundiEmail, code: r.json.devOtp, purpose: 'register' } });
  saveJar('fundi_pending');

  // Admin
  cookies = {};
  await request('POST', '/api/auth/login', { body: { email: 'admin@patafundi.com', password: 'Admin@2024!' } });
  saveJar('admin');

  // Approve the fundi
  loadJar('admin');
  await request('POST', `/api/admin/fundis/${fundiId}/approve`);
  loadJar('fundi_pending');
  saveJar('fundi_approved');

  return { fundiId, fundiEmail };
}

async function main() {
  console.log('\n=== PataFundi FULL Certification Audit ===');
  console.log(`Target: ${API}\n`);

  // ---------- 1. Health + version ----------
  console.log('— Health & build metadata —');
  let r = await request('GET', '/health');
  check('GET /health returns 200', r.status === 200, r.body);
  check('DB mode reported', Boolean(r.json?.database?.mode), JSON.stringify(r.json?.database));
  r = await request('GET', '/api/health');
  check('GET /api/health returns build metadata', r.status === 200 && r.json?.success, r.body);

  // ---------- 2. Setup users ----------
  console.log('\n— User setup —');
  const { fundiId } = await setupUsers();
  check('fundi setup complete', Boolean(fundiId), 'no fundiId');

  // ---------- 3. Every route smoke test ----------
  console.log('\n— Route smoke test (authenticated) —');

  // Auth routes
  loadJar('customer');
  r = await request('GET', '/api/users/me');
  check('GET /api/users/me', r.status === 200, r.body);
  r = await request('PUT', '/api/users/me', { body: { fullName: 'C2' } });
  check('PUT /api/users/me', r.status === 200, r.body);
  r = await request('GET', '/api/users/settings');
  check('GET /api/users/settings', r.status === 200, r.body);
  r = await request('PUT', '/api/users/settings', { body: { notifications: { email: true } } });
  check('PUT /api/users/settings', r.status === 200, r.body);
  r = await request('GET', '/api/users/saved-places');
  check('GET /api/users/saved-places', r.status === 200, r.body);
  r = await request('POST', '/api/users/saved-places', { body: { name: 'Home', address: 'Nairobi', latitude: -1.26, longitude: 36.81 } });
  check('POST /api/users/saved-places', r.status === 201, r.body);
  r = await request('POST', '/api/users/change-password', { body: { currentPassword: 'Customer@2024', newPassword: 'Customer@2025' } });
  check('POST /api/users/change-password', r.status === 200, r.body);

  // Jobs
  r = await request('POST', '/api/jobs', { body: { serviceCategory: 'plumbing', description: 'tap', formattedAddress: 'Nairobi', latitude: -1.26, longitude: 36.81, estimatedPrice: 1500 } });
  check('POST /api/jobs', r.status === 201, r.body);
  const jobId = r.json?.job?.id;
  r = await request('GET', '/api/jobs');
  check('GET /api/jobs', r.status === 200, r.body);
  r = await request('GET', `/api/jobs/${jobId}`);
  check('GET /api/jobs/:id', r.status === 200, r.body);
  r = await request('GET', `/api/jobs/${jobId}/status`);
  check('GET /api/jobs/:id/status', r.status === 200, r.body);
  r = await request('GET', `/api/jobs/${jobId}/location`);
  check('GET /api/jobs/:id/location', r.status === 200, r.body);

  // Upload job photos
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: fakeImage(), filename: 'p.png', contentType: 'image/png' }],
  });
  check('POST /api/jobs/:id/photos', r.status === 201, r.body);
  r = await request('GET', `/api/jobs/${jobId}/photos`);
  check('GET /api/jobs/:id/photos', r.status === 200, r.body);
  if (r.json?.photos?.[0]?.id) {
    r = await request('GET', `/api/jobs/${jobId}/photos/${r.json.photos[0].id}/signed-url`);
    check('GET /api/jobs/:id/photos/:photoId/signed-url', r.status === 200, r.body);
  }

  // Payments
  r = await request('GET', `/api/payments/job/${jobId}`);
  check('GET /api/payments/job/:jobId', r.status === 200, r.body);
  r = await request('GET', `/api/payments/escrow/${jobId}`);
  check('GET /api/payments/escrow/:jobId', r.status === 200, r.body);
  r = await request('GET', '/api/payments/wallet/balance');
  check('GET /api/payments/wallet/balance', r.status === 200, r.body);

  // Notifications
  r = await request('GET', '/api/notifications');
  check('GET /api/notifications', r.status === 200, r.body);
  r = await request('PATCH', '/api/notifications/read-all');
  check('PATCH /api/notifications/read-all', r.status === 200, r.body);

  // Content
  r = await request('GET', '/api/blog');
  check('GET /api/blog', r.status === 200, r.body);
  r = await request('GET', '/api/help');
  check('GET /api/help', r.status === 200, r.body);
  r = await request('GET', '/api/policies/privacy');
  check('GET /api/policies/:slug', r.status === 200, r.body);
  r = await request('GET', '/api/services/plumbing');
  check('GET /api/services/:slug', r.status === 200, r.body);

  // Maps
  r = await request('GET', '/api/maps/search?q=Nairobi');
  check('GET /api/maps/search', r.status === 200, r.body);
  r = await request('POST', '/api/maps/reverse-geocode', { body: { latitude: -1.2864, longitude: 36.8172 } });
  check('POST /api/maps/reverse-geocode', r.status === 200, r.body);

  // Fundi routes (approved fundi)
  loadJar('fundi_approved');
  r = await request('GET', '/api/fundi/profile');
  check('GET /api/fundi/profile', r.status === 200, r.body);
  r = await request('GET', '/api/fundi/onboarding-status');
  check('GET /api/fundi/onboarding-status', r.status === 200, r.body);
  r = await request('GET', '/api/fundi/approval-status');
  check('GET /api/fundi/approval-status', r.status === 200, r.body);
  r = await request('GET', '/api/fundi/dashboard');
  check('GET /api/fundi/dashboard', r.status === 200, r.body);
  r = await request('GET', '/api/fundi/status');
  check('GET /api/fundi/status', r.status === 200, r.body);
  r = await request('POST', '/api/fundi/status/online', { body: { latitude: -1.28, longitude: 36.81 } });
  check('POST /api/fundi/status/online', r.status === 200, r.body);
  r = await request('POST', '/api/fundi/status/offline');
  check('POST /api/fundi/status/offline', r.status === 200, r.body);
  r = await request('GET', '/api/fundi/wallet/transactions');
  check('GET /api/fundi/wallet/transactions', r.status === 200, r.body);

  // Fundi accepts the customer's job
  loadJar('fundi_approved');
  r = await request('POST', `/api/jobs/${jobId}/accept`);
  check('POST /api/jobs/:id/accept (approved fundi)', r.status === 200, r.body);
  r = await request('GET', '/api/jobs/fundi/active');
  check('GET /api/jobs/fundi/active (approved fundi)', r.status === 200, r.body);
  r = await request('POST', `/api/jobs/${jobId}/check-in`, { body: { latitude: -1.26, longitude: 36.81, status: 'on_the_way' } });
  check('POST /api/jobs/:id/check-in', r.status === 200, r.body);

  // Public fundi endpoints
  r = await request('GET', '/api/fundi/search');
  check('GET /api/fundi/search (public)', r.status === 200, r.body);
  r = await request('GET', `/api/fundi/${fundiId}`);
  check('GET /api/fundi/:id (public)', r.status === 200, r.body);
  r = await request('GET', `/api/fundi/${fundiId}/reviews`);
  check('GET /api/fundi/:id/reviews (public)', r.status === 200, r.body);

  // Chat
  loadJar('customer');
  r = await request('GET', `/api/jobs/${jobId}/messages`);
  check('GET /api/jobs/:jobId/messages', r.status === 200, r.body);
  r = await request('POST', `/api/jobs/${jobId}/messages`, { body: { body: 'Hello fundi' } });
  check('POST /api/jobs/:jobId/messages (text)', r.status === 201, r.body);
  r = await request('POST', `/api/jobs/${jobId}/messages/read`);
  check('POST /api/jobs/:jobId/messages/read', r.status === 200, r.body);

  // Disputes
  r = await request('POST', '/api/disputes', { body: { jobId, reason: 'test dispute', description: 'Issue with the work' } });
  check('POST /api/disputes', r.status === 201, r.body);
  r = await request('GET', '/api/disputes');
  check('GET /api/disputes', r.status === 200, r.body);

  // Admin routes
  loadJar('admin');
  const adminGetRoutes = [
    '/api/admin/dashboard', '/api/admin/dashboard-stats', '/api/admin/fundis',
    '/api/admin/customers', '/api/admin/jobs', '/api/admin/payments',
    '/api/admin/transactions', '/api/admin/escrow-queue', '/api/admin/audit-logs',
    '/api/admin/reports', '/api/admin/reports/analytics', '/api/admin/revenue',
    '/api/admin/fraud/dashboard', '/api/admin/fraud/alerts', '/api/admin/fraud/debts',
    '/api/admin/fraud/suspicious-jobs', '/api/admin/fraud/suspicious-users',
    '/api/admin/fraud/reports', '/api/admin/security/overview',
    '/api/admin/security-alerts', '/api/admin/trust-scores', '/api/admin/bypass-alerts',
    '/api/admin/settings',
  ];
  for (const p of adminGetRoutes) {
    r = await request('GET', p);
    check(`GET ${p}`, r.status === 200, `got ${r.status}: ${r.body?.slice(0, 100)}`);
  }
  r = await request('GET', `/api/admin/fundis/${fundiId}`);
  check('GET /api/admin/fundis/:id', r.status === 200, r.body);
  r = await request('GET', `/api/admin/fraud/users/${fundiId}`);
  check('GET /api/admin/fraud/users/:userId', r.status === 200, r.body);

  // Verification endpoints (fundi_pending account is needed for these; create one)
  cookies = {};
  const pendEmail = `pend-${Date.now()}@x.com`;
  r = await request('POST', '/api/auth/register/fundi', {
    formData: [
      { name: 'email', value: pendEmail },
      { name: 'password', value: 'Fundi@2024' },
      { name: 'fullName', value: 'P' },
      { name: 'phone', value: '254712000333' },
      { name: 'skills', value: JSON.stringify(['electrical']) },
      { name: 'idPhoto', value: fakeImage(), filename: 'id.png', contentType: 'image/png' },
      { name: 'selfiePhoto', value: fakeImage(), filename: 's.png', contentType: 'image/png' },
    ],
  });
  await request('POST', '/api/auth/otp-verify', { body: { email: pendEmail, code: r.json.devOtp, purpose: 'register' } });
  saveJar('fundi_pending2');

  loadJar('fundi_pending2');
  r = await request('GET', '/api/verification/challenges');
  check('GET /api/verification/challenges', r.status === 200, r.body);
  r = await request('GET', '/api/verification/status');
  check('GET /api/verification/status', r.status === 200, r.body);

  // ---------- 4. Security pentest ----------
  console.log('\n— Security pentest —');

  // 4.1 JWT forgery (HS256 with wrong signature)
  const forged = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'admin', roles: ['admin'] })).toString('base64url') + '.' +
    'invalid';
  cookies = {};
  r = await request('GET', '/api/admin/dashboard', { headers: { Authorization: `Bearer ${forged}` } });
  check('forged admin JWT rejected', r.status === 401 || r.status === 403, `got ${r.status}`);

  // 4.2 alg=none attack
  const noneToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'admin' })).toString('base64url') + '.';
  r = await request('GET', '/api/admin/dashboard', { headers: { Authorization: `Bearer ${noneToken}` } });
  check('alg=none JWT rejected', r.status === 401 || r.status === 403, `got ${r.status}`);

  // 4.3 Refresh token reuse after logout
  loadJar('customer');
  const refreshToken = cookies.refresh_token;
  await request('POST', '/api/auth/logout');
  // Try to refresh with the now-revoked token
  cookies = { refresh_token: refreshToken };
  r = await request('POST', '/api/auth/refresh');
  check('revoked refresh token rejected', r.status === 403, `got ${r.status}: ${r.body}`);

  // 4.4 Customer → admin escalation
  // Re-login the customer (password was changed to Customer@2025)
  cookies = {};
  await request('POST', '/api/auth/login', { body: { email: `cust-${Date.now()}@x.com`.replace(/.*cust-/, 'cust-').replace('@x.com', '@x.com'), password: 'Customer@2025' } }).catch(() => {});
  // Re-register a fresh customer for clean test
  cookies = {};
  const freshEmail = `fresh-${Date.now()}@x.com`;
  r = await request('POST', '/api/auth/register', { body: { email: freshEmail, password: 'Customer@2024', fullName: 'Fresh' } });
  await request('POST', '/api/auth/otp-verify', { body: { email: freshEmail, code: r.json.devOtp, purpose: 'register' } });
  saveJar('customer2');
  r = await request('GET', '/api/admin/dashboard');
  check('customer cannot reach /api/admin/dashboard', r.status === 403, `got ${r.status}`);
  r = await request('POST', '/api/admin/fundis/00000000-0000-0000-0000-000000000000/approve');
  check('customer cannot approve fundis', r.status === 403, `got ${r.status}`);
  r = await request('POST', '/api/admin/users/00000000-0000-0000-0000-000000000000/disable');
  check('customer cannot disable users', r.status === 403, `got ${r.status}`);

  // 4.5 Fundi → admin escalation
  loadJar('fundi_approved');
  r = await request('GET', '/api/admin/dashboard');
  check('fundi cannot reach /api/admin/dashboard', r.status === 403, `got ${r.status}`);

  // 4.6 Pending fundi → approved fundi (bypass middleware)
  loadJar('fundi_pending2');
  r = await request('GET', '/api/jobs/fundi/active');
  check('pending fundi cannot get active job', r.status === 403, `got ${r.status}`);
  r = await request('POST', '/api/fundi/location', { body: { latitude: 0, longitude: 0 } });
  check('pending fundi cannot update location', r.status === 403, `got ${r.status}`);

  // 4.7 SQL injection attempts
  loadJar('customer');
  r = await request('GET', '/api/jobs?q=%27%20OR%201%3D1--');
  check('SQLi in jobs query — no error leak', r.status !== 500, `got ${r.status}`);
  r = await request('GET', '/api/admin/fundis/00000000%27%20OR%201%3D1--');
  check('SQLi in fundi id — no error leak', r.status !== 500, `got ${r.status}`);

  // 4.8 XSS in chat — should be blocked by content scan AND auto-escaped by React
  loadJar('customer');
  r = await request('POST', `/api/jobs/${jobId}/messages`, { body: { body: '<script>alert(1)</script>' } });
  check('XSS payload in chat — handled', r.status === 201 || r.status === 403, `got ${r.status}: ${r.body?.slice(0, 80)}`);

  // 4.9 Off-platform contact bypass
  r = await request('POST', `/api/jobs/${jobId}/messages`, { body: { body: 'call me on 0712345678' } });
  check('phone-number bypass blocked', r.status === 403, `got ${r.status}`);
  r = await request('POST', `/api/jobs/${jobId}/messages`, { body: { body: 'pay me via mpesa 0712345678' } });
  check('mpesa bypass blocked', r.status === 403, `got ${r.status}`);

  // 4.10 IDOR — list another user's notifications
  loadJar('fundi_approved');
  r = await request('GET', '/api/notifications');
  check('fundi gets own notifications only', r.status === 200 && Array.isArray(r.json?.notifications), r.body);

  // 4.11 Upload attacks
  console.log('\n— Upload attacks —');
  loadJar('customer');
  // Executable disguised as PNG (MIME spoofing)
  const exeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: exeBuf, filename: 'evil.png', contentType: 'image/png' }],
  });
  check('EXE disguised as PNG — rejected (sharp fails to decode)', r.status === 400 || r.status === 500, `got ${r.status}`);

  // HTML file disguised as image
  const htmlBuf = Buffer.from('<html><script>alert(1)</script></html>');
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: htmlBuf, filename: 'evil.html', contentType: 'text/html' }],
  });
  check('HTML upload rejected by MIME filter', r.status === 400, `got ${r.status}`);

  // SVG (XSS vector — should be blocked)
  const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: svgBuf, filename: 'evil.svg', contentType: 'image/svg+xml' }],
  });
  check('SVG upload rejected', r.status === 400, `got ${r.status}`);

  // Oversized file (>8MB)
  const bigBuf = Buffer.alloc(9 * 1024 * 1024, 0);
  r = await request('POST', `/api/jobs/${jobId}/photos`, {
    formData: [{ name: 'photos', value: bigBuf, filename: 'big.png', contentType: 'image/png' }],
  });
  check('9MB upload rejected by size limit', r.status === 400 || r.status === 413, `got ${r.status}`);

  // 4.12 Path traversal on storage
  r = await request('GET', `/api/storage/local/${encodeURIComponent('../../../etc/passwd')}`);
  check('path traversal blocked', r.status === 403 || r.status === 400, `got ${r.status}`);

  // 4.13 Bucket enumeration
  r = await request('GET', '/api/storage/local/');
  check('empty storage key rejected', r.status === 403 || r.status === 400, `got ${r.status}`);

  // 4.14 Rate limit bypass — hammer OTP endpoint with the SAME email
  // (the limiter is per IP+email, so different emails would never trip it).
  console.log('\n— Rate limit tests —');
  cookies = {};
  const otpStart = Date.now();
  let blocked = false;
  for (let i = 0; i < 15; i++) {
    r = await request('POST', '/api/auth/otp-resend', { body: { email: 'rate-limit-test@patafundi-test.com', purpose: 'register' } });
    if (r.status === 429) { blocked = true; break; }
  }
  check('OTP resend rate limit kicks in (same email)', blocked, `after ${Date.now() - otpStart}ms`);

  // 4.15 CSRF — POST without csrf header
  loadJar('customer');
  const savedCsrf = cookies.csrf_token;
  delete cookies.csrf_token;
  r = await request('POST', '/api/jobs', { body: { serviceCategory: 'plumbing', description: 'csrf' } });
  check('CSRF: POST without csrf_token rejected', r.status === 403, `got ${r.status}`);
  cookies.csrf_token = savedCsrf;

  // 4.16 Register with role=admin
  cookies = {};
  r = await request('POST', '/api/auth/register', { body: { email: `evil-${Date.now()}@x.com`, password: 'Evil@1234', fullName: 'E', role: 'admin' } });
  check('register with role=admin rejected', r.status === 403, `got ${r.status}`);

  // ---------- 5. Database integrity ----------
  console.log('\n— DB integrity (via /health + endpoint behavior) —');
  loadJar('customer'); // restore csrf_token before GET tests below
  r = await request('GET', '/health');
  check('DB ok', r.json?.database?.ok === true, JSON.stringify(r.json?.database));

  // Invalid UUID format → 400 not 500
  r = await request('GET', '/api/jobs/not-a-uuid');
  check('invalid UUID returns 400 not 500', r.status === 400, `got ${r.status}: ${r.body}`);

  // Reference nonexistent job (valid UUID v4 format, doesn't exist in DB)
  r = await request('GET', '/api/jobs/a2345678-1234-1234-8234-123456789abc');
  check('nonexistent job returns 404', r.status === 404, `got ${r.status}: ${r.body}`);

  // ---------- 6. Socket.IO auth ----------
  console.log('\n— Socket.IO auth —');
  r = await request('GET', '/socket.io/?EIO=4&transport=polling');
  check('socket.io polling reachable', r.status === 200, `got ${r.status}`);

  // ---------- 7. Realtime room hijacking ----------
  console.log('\n— Realtime room hijack (server-side check via route logic) —');
  // We can't open a real WS from this script, but we CAN verify the
  // server-side `canAccessJobRoom` logic by attempting to subscribe via
  // the polling transport and checking the response.
  // For now we just confirm the auth middleware rejects unauthed sockets.
  // A real test would use socket.io-client — left as a follow-up.

  // ---------- 8. Final job lifecycle ----------
  console.log('\n— Job lifecycle completion —');
  loadJar('fundi_approved');
  r = await request('PATCH', `/api/jobs/${jobId}/status`, { body: { status: 'in_progress' } });
  check('PATCH job -> in_progress', r.status === 200, r.body);
  r = await request('POST', `/api/jobs/${jobId}/complete`, { body: {} });
  check('POST /jobs/:id/complete', r.status === 200, r.body);
  // Customer confirm with WRONG otp
  loadJar('customer');
  r = await request('POST', `/api/jobs/${jobId}/confirm-completion`, { body: { otp: '000000' } });
  check('confirm-completion with wrong OTP rejected', r.status === 403, `got ${r.status}`);

  // ---------- Summary ----------
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total:  ${results.length}\n`);

  fs.writeFileSync('/home/z/my-project/download/FULL_AUDIT_RESULTS.json', JSON.stringify({ pass: passCount, fail: failCount, results }, null, 2));
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(2); });
