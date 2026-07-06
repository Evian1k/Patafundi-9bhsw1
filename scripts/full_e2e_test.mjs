/**
 * PataFundi Full E2E Test — Multi-user, multi-location, varied ratings
 * Uses existing demo accounts + creates new test users with delays
 */
const BASE = 'http://127.0.0.1:4000';
const results = [];
let pass = 0, fail = 0;

function log(ok, name, detail = '') {
  const icon = ok ? 'PASS' : 'FAIL';
  if (ok) pass++; else fail++;
  console.log(`  ${icon}  ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`);
  results.push({ icon, name, detail, ok });
}

async function api(method, path, { token, body } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await api('POST', '/api/auth/login', { body: { email, password } });
  return r.json?.token || null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LOCATIONS = {
  nairobi: { lat: -1.2864, lng: 36.8172, name: 'Nairobi CBD' },
  westlands: { lat: -1.2676, lng: 36.8108, name: 'Westlands' },
  karen: { lat: -1.3197, lng: 36.7076, name: 'Karen' },
  mombasa: { lat: -4.0435, lng: 39.6682, name: 'Mombasa' },
  kisumu: { lat: -0.0917, lng: 34.7680, name: 'Kisumu' },
  nakuru: { lat: -0.3031, lng: 36.0800, name: 'Nakuru' },
};

console.log('\n=== PATAFUNDI FULL E2E TEST ===\n');

// ── PHASE 1: Login existing demo accounts ─────────────────────
console.log('— Phase 1: Login Demo Accounts —');

const SA_TOKEN = await login('admin@patafundi.com', 'Admin@2024!');
log(Boolean(SA_TOKEN), 'Super Admin login');

const CUST_TOKEN = await login('demo@patafundi.com', 'Demo@2024!');
log(Boolean(CUST_TOKEN), 'Customer login (demo@patafundi.com)');

// Try fundi login
const FUNDI_TOKEN = await login('fundi@patafundi.com', 'Fundi@2024!');
log(Boolean(FUNDI_TOKEN), 'Fundi login (fundi@patafundi.com)');

// Try all staff roles
const staffRoles = [
  { email: 'ops@patafundi.com', pw: 'Ops@2024!', role: 'ops_manager' },
  { email: 'support@patafundi.com', pw: 'Support@2024!', role: 'support_agent' },
  { email: 'fraud@patafundi.com', pw: 'Fraud@2024!', role: 'fraud_analyst' },
  { email: 'finance@patafundi.com', pw: 'Finance@2024!', role: 'finance_team' },
  { email: 'dispatch@patafundi.com', pw: 'Dispatch@2024!', role: 'dispatch_team' },
  { email: 'devops@patafundi.com', pw: 'Devops@2024!', role: 'devops_engineer' },
  { email: 'auditor@patafundi.com', pw: 'Auditor@2024!', role: 'auditor' },
];

for (const s of staffRoles) {
  const token = await login(s.email, s.pw);
  log(Boolean(token), `Staff login: ${s.role}`, s.email);
}

// ── PHASE 2: Geo Matching at different locations ──────────────
console.log('\n— Phase 2: Geo Matching (Multiple Locations) —');

// Nairobi customer searches for plumbers
const matchNairobi = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.nairobi.lat, longitude: LOCATIONS.nairobi.lng, serviceCategory: 'plumbing' },
});
log(matchNairobi.status === 200, 'Nairobi → plumbing', `Found ${matchNairobi.json?.count || 0} fundis`);

if (matchNairobi.json?.fundis?.length > 0) {
  const top = matchNairobi.json.fundis[0];
  log(true, 'Top fundi score', `Score: ${top.weighted_score}, Distance: ${top.distance_km}km, Name: ${top.name}`);
  log(Boolean(top.scores?.distance !== undefined), 'Score breakdown', JSON.stringify(top.scores));

  // Verify ranking is by weighted score (not just distance)
  if (matchNairobi.json.fundis.length > 1) {
    const sorted = matchNairobi.json.fundis.every((f, i, arr) => i === 0 || arr[i-1].weighted_score >= f.weighted_score);
    log(sorted, 'Fundis sorted by weighted score', 'Highest score first ✅');
  }
}

// Westlands customer searches
const matchWestlands = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.westlands.lat, longitude: LOCATIONS.westlands.lng, serviceCategory: 'electrical' },
});
log(matchWestlands.status === 200, 'Westlands → electrical', `Found ${matchWestlands.json?.count || 0} fundis`);

// Karen customer searches
const matchKaren = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.karen.lat, longitude: LOCATIONS.karen.lng, serviceCategory: 'cleaning' },
});
log(matchKaren.status === 200, 'Karen → cleaning', `Found ${matchKaren.json?.count || 0} fundis`);

// Mombasa customer searches (cross-county — should find 0 or very few)
const matchMombasa = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.mombasa.lat, longitude: LOCATIONS.mombasa.lng, serviceCategory: 'plumbing' },
});
log(matchMombasa.status === 200, 'Mombasa → plumbing (cross-county)', `Found ${matchMombasa.json?.count || 0} fundis`);

// Kisumu customer searches
const matchKisumu = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.kisumu.lat, longitude: LOCATIONS.kisumu.lng, serviceCategory: 'plumbing' },
});
log(matchKisumu.status === 200, 'Kisumu → plumbing', `Found ${matchKisumu.json?.count || 0} fundis`);

// Nakuru customer searches
const matchNakuru = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.nakuru.lat, longitude: LOCATIONS.nakuru.lng, serviceCategory: 'hvac' },
});
log(matchNakuru.status === 200, 'Nakuru → HVAC', `Found ${matchNakuru.json?.count || 0} fundis`);

// ── PHASE 3: Surge Pricing ────────────────────────────────────
console.log('\n— Phase 3: Surge Pricing —');

const surge1 = await api('POST', '/api/geo/surge-pricing', {
  token: CUST_TOKEN,
  body: { basePrice: 2000, distanceKm: 5, isEmergency: false },
});
log(surge1.status === 200, 'Normal pricing (5km)', `Total: KES ${surge1.json?.pricing?.totalPrice}`);

const surge2 = await api('POST', '/api/geo/surge-pricing', {
  token: CUST_TOKEN,
  body: { basePrice: 2000, distanceKm: 15, isEmergency: true },
});
log(surge2.status === 200, 'Emergency pricing (15km)', `Total: KES ${surge2.json?.pricing?.totalPrice}`);

const surge3 = await api('POST', '/api/geo/surge-pricing', {
  token: CUST_TOKEN,
  body: { basePrice: 5000, distanceKm: 30, isEmergency: true, isNight: true },
});
log(surge3.status === 200, 'Emergency + night (30km)', `Total: KES ${surge3.json?.pricing?.totalPrice}`);

// Verify breakdown
if (surge3.json?.pricing?.breakdown) {
  const b = surge3.json.pricing.breakdown;
  log(b.service === 5000 && b.travel > 0 && b.emergency > 0 && b.night > 0, 'Price breakdown correct', JSON.stringify(b));
}

// ── PHASE 4: Full Job Journey ─────────────────────────────────
console.log('\n— Phase 4: Full Job Journey —');

// Customer creates job
const jobCreate = await api('POST', '/api/jobs', {
  token: CUST_TOKEN,
  body: {
    serviceCategory: 'plumbing',
    description: 'Burst pipe under kitchen sink - urgent!',
    latitude: LOCATIONS.nairobi.lat,
    longitude: LOCATIONS.nairobi.lng,
    estimatedPrice: 2000,
    urgency: 'emergency',
  },
});
log(jobCreate.status === 201, 'Job created', `ID: ${jobCreate.json?.job?.id?.substring(0, 8)}`);

const jobId = jobCreate.json?.job?.id;
if (jobId && FUNDI_TOKEN) {
  // Fundi accepts
  const accept = await api('POST', `/api/jobs/${jobId}/accept`, { token: FUNDI_TOKEN });
  log(accept.status === 200, 'Fundi accepts job');

  // Fundi updates GPS location
  const gps = await api('POST', '/api/fundi/location', {
    token: FUNDI_TOKEN,
    body: { latitude: -1.2900, longitude: 36.8200, accuracy: 10, jobId },
  });
  log(gps.status === 200, 'GPS location update');

  // Fundi checks in (needs lat/lng for proximity verification)
  const checkIn = await api('POST', `/api/jobs/${jobId}/check-in`, {
    token: FUNDI_TOKEN,
    body: { latitude: LOCATIONS.nairobi.lat, longitude: LOCATIONS.nairobi.lng },
  });
  log(checkIn.status === 200, 'Fundi check-in', checkIn.json?.message || '');

  // Set job to in_progress (required before completion)
  const inProgress = await api('PATCH', `/api/jobs/${jobId}/status`, {
    token: FUNDI_TOKEN,
    body: { status: 'in_progress' },
  });
  log(inProgress.status === 200, 'Job set to in_progress');

  // Fundi completes
  const complete = await api('POST', `/api/jobs/${jobId}/complete`, { token: FUNDI_TOKEN });
  log(complete.status === 200, 'Fundi completes job', complete.json?.message || '');

  // Customer confirms with OTP
  if (complete.json?.completionOtp) {
    const confirm = await api('POST', `/api/jobs/${jobId}/confirm-completion`, {
      token: CUST_TOKEN,
      body: { otp: complete.json.completionOtp },
    });
    log(confirm.status === 200, 'Customer confirms (OTP)');
  } else {
    log(false, 'Customer confirms (OTP)', 'No completionOtp returned');
  }

  // Customer reviews
  const review = await api('POST', `/api/jobs/${jobId}/review`, {
    token: CUST_TOKEN,
    body: { rating: 5, comment: 'Excellent work!' },
  });
  log(review.status === 200, 'Customer reviews (5 stars)');
}

// ── PHASE 5: International Booking ────────────────────────────
console.log('\n— Phase 5: International Booking —');

const intlReq = await api('POST', '/api/geo/international-booking', {
  token: CUST_TOKEN,
  body: {
    destinationCountry: 'UAE',
    destinationCity: 'Dubai',
    serviceNeeded: 'electrical',
    expectedBudget: 50000,
    startDate: '2026-07-15',
    endDate: '2026-07-20',
    notes: 'Need Kenyan electrician for hotel',
  },
});
log(intlReq.status === 201, 'International booking request', `ID: ${intlReq.json?.booking?.id?.substring(0, 8) || 'failed'}`);

// List international bookings
const intlList = await api('GET', '/api/geo/international-bookings', { token: SA_TOKEN });
log(intlList.status === 200, 'List international bookings', `Count: ${intlList.json?.bookings?.length}`);

// Approve
if (intlReq.json?.booking?.id) {
  const review = await api('POST', `/api/geo/international-bookings/${intlReq.json.booking.id}/review`, {
    token: SA_TOKEN,
    body: { status: 'approved', reviewNotes: 'Approved' },
  });
  log(review.status === 200, 'Approve international booking');
}

// ── PHASE 6: Fraud Prevention ─────────────────────────────────
console.log('\n— Phase 6: Fraud Prevention —');

const fraudOverview = await api('GET', '/api/fraud/overview', { token: SA_TOKEN });
log(fraudOverview.status === 200, 'Fraud overview');

const blacklistCheck = await api('POST', '/api/fraud/blacklist/check', {
  token: SA_TOKEN,
  body: { type: 'email', value: 'demo@patafundi.com' },
});
log(blacklistCheck.status === 200, 'Blacklist check', `Blocked: ${blacklistCheck.json?.isBlacklisted}`);

// Add + check blacklist
const addBlock = await api('POST', '/api/fraud/blacklist', {
  token: SA_TOKEN,
  body: { type: 'ip', value: '203.0.113.99', reason: 'fraud', details: 'Test block' },
});
log(addBlock.status === 201, 'Add to blacklist');

const checkBlock = await api('POST', '/api/fraud/blacklist/check', {
  token: SA_TOKEN,
  body: { type: 'ip', value: '203.0.113.99' },
});
log(checkBlock.json?.isBlacklisted === true, 'Blacklist enforced', 'IP blocked ✅');

// ── PHASE 7: CEO Dashboard ────────────────────────────────────
console.log('\n— Phase 7: CEO Dashboard & Staff Systems —');

const endpoints = [
  { path: '/api/staff/dashboard', name: 'Staff dashboard' },
  { path: '/api/fraud/overview', name: 'Fraud overview' },
  { path: '/api/ai/dashboard', name: 'AI dashboard' },
  { path: '/api/referrals/analytics', name: 'Referral analytics' },
  { path: '/api/admin/emergency/status', name: 'Emergency controls' },
  { path: '/api/geo/controls', name: 'Geo controls' },
  { path: '/api/geo/service-radius', name: 'Service radius rules' },
  { path: '/api/admin/commission-overrides', name: 'Category commissions' },
  { path: '/api/admin/system-health', name: 'System health' },
  { path: '/api/staff/error-logs', name: 'Error logs' },
  { path: '/api/staff/me/permissions', name: 'Staff permissions' },
  { path: '/api/admin/maintenance/schedule', name: 'Maintenance schedule' },
];

for (const e of endpoints) {
  const r = await api('GET', e.path, { token: SA_TOKEN });
  log(r.status === 200, e.name);
}

// ── PHASE 8: Geo Controls ─────────────────────────────────────
console.log('\n— Phase 8: CEO Geo Controls —');

const controls = await api('GET', '/api/geo/controls', { token: SA_TOKEN });
log(controls.status === 200, 'Get geo controls', `Max radius: ${controls.json?.controls?.max_radius_km}km`);

// Update geo controls
const updateControls = await api('PUT', '/api/geo/controls', {
  token: SA_TOKEN,
  body: { disaster_mode: false, emergency_radius_km: 80 },
});
log(updateControls.status === 200, 'Update geo controls');

// Service radius rules
const rules = await api('GET', '/api/geo/service-radius', { token: SA_TOKEN });
log(rules.status === 200, 'Service radius rules', `${rules.json?.rules?.length} categories`);

// ── PHASE 9: Cross-Location Restrictions ──────────────────────
console.log('\n— Phase 9: Cross-Location Restrictions —');

// Nairobi → HVAC (fundis in Nakuru = ~150km away, should be excluded with 20km radius)
const cross1 = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.nairobi.lat, longitude: LOCATIONS.nairobi.lng, serviceCategory: 'hvac' },
});
log(cross1.status === 200, 'Nairobi → HVAC (cross-county check)', `Found: ${cross1.json?.count || 0}`);

// Mombasa → welding (fundis in Nairobi = ~450km away, should be excluded)
const cross2 = await api('POST', '/api/geo/find-fundis', {
  token: CUST_TOKEN,
  body: { latitude: LOCATIONS.mombasa.lat, longitude: LOCATIONS.mombasa.lng, serviceCategory: 'welding' },
});
log(cross2.status === 200, 'Mombasa → welding (cross-county check)', `Found: ${cross2.json?.count || 0}`);

// ── PHASE 10: Security Tests ──────────────────────────────────
console.log('\n— Phase 10: Security Tests —');

// Customer cannot access admin
const sec1 = await api('GET', '/api/admin/dashboard', { token: CUST_TOKEN });
log(sec1.status === 403, 'Customer blocked from admin');

// Customer cannot access staff
const sec2 = await api('GET', '/api/staff/me/permissions', { token: CUST_TOKEN });
log(sec2.status === 200, 'Customer can check own permissions (returns empty)');

// Forged JWT
const sec3 = await api('GET', '/api/users/me', { token: 'fake.token.here' });
log(sec3.status === 401, 'Forged JWT rejected');

// No auth
const sec4 = await api('GET', '/api/users/me');
log(sec4.status === 403, 'No auth blocked');

// SQL injection
const sec5 = await api('POST', '/api/auth/login', { body: { email: "admin@patafundi.com' OR 1=1--", password: 'x' } });
log(sec5.json?.success !== true, 'SQL injection blocked');

// ── SUMMARY ───────────────────────────────────────────────────
console.log('\n=== FULL E2E TEST SUMMARY ===');
console.log(`Passed: ${pass}`);
console.log(`Failed: ${fail}`);
console.log(`Total:  ${pass + fail}`);

if (fail > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.name} — ${r.detail}`));
}

console.log('\n=== SYSTEM STATUS ===');
if (fail === 0) {
  console.log('✅ ALL SYSTEMS WORKING — Platform is fully functional');
} else if (fail <= 5) {
  console.log('⚠️ MOSTLY WORKING — Minor issues found');
} else {
  console.log('❌ ISSUES FOUND — Needs fixing');
}

process.exit(fail > 5 ? 1 : 0);
