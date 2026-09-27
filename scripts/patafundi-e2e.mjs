#!/usr/bin/env node
// patafundi-e2e.js — End-to-end API journey test for the PataFundi takeover.
// Verifies the FULL company ecosystem: booking → dispatch → work → payment →
// settlement → review → audit, plus security boundaries (IDOR/tampering).
import 'dotenv/config';

const BASE = process.env.PATAFUNDI_E2E_BASE || 'http://localhost:4000/api';
let passed = 0, failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* html or empty */ }
  return { status: res.status, json, cookies: res.headers.getSetCookie?.() || [] };
}

async function login(email, password) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  const token = r.json?.token || r.json?.accessToken;
  return { token, status: r.status, user: r.json?.user };
}

const PW = 'PataFundi#2026';

async function main() {
  console.log('── 1. Demo account logins ──');
  const customer = await login('customer.demo@patafundi.test', PW);
  check('customer login', customer.status === 200 && !!customer.token, `got ${customer.status}`);
  const company = await login('company.demo@patafundi.test', PW);
  check('company owner login', company.status === 200 && !!company.token);
  const dispatcher = await login('dispatcher.demo@patafundi.test', PW);
  check('dispatcher login', dispatcher.status === 200 && !!dispatcher.token);
  const technician = await login('technician.demo@patafundi.test', PW);
  check('technician login', technician.status === 200 && !!technician.token);
  const staffOps = await login('operations.demo@patafundi.test', PW);
  check('staff operations login', staffOps.status === 200 && !!staffOps.token);
  const staffFinance = await login('finance.demo@patafundi.test', PW);
  check('staff finance login', staffFinance.status === 200 && !!staffFinance.token);
  const superAdmin = await login('admin.demo@patafundi.test', PW);
  check('super admin login', superAdmin.status === 200 && !!superAdmin.token);

  console.log('── 2. Public company directory (customer-safe) ──');
  const dir = await api('/companies');
  check('directory returns 200', dir.status === 200);
  const apex = dir.json?.companies?.find((c) => c.companyName?.includes('Apex'));
  check('Apex Home Services listed', !!apex);
  check('no settlement/commission fields leaked', apex && !('pendingSettlements' in apex) && !('commission' in apex));

  const profile = await api(`/companies/${apex.id}`);
  check('public company profile', profile.status === 200 && profile.json?.company?.id === apex.id);
  check('profile exposes no internal finance', !('settlements' in (profile.json || {})));

  console.log('── 3. Customer books the company directly ──');
  const created = await api('/jobs', {
    method: 'POST', token: customer.token,
    body: {
      serviceCategory: 'plumbing',
      description: 'E2E: kitchen sink leaking, book Apex directly.',
      latitude: -1.2921, longitude: 36.7819,
      formattedAddress: '12 Kilimani Business Road',
      estimatedPrice: 4000,
      companyId: apex.id,
      urgency: 'normal',
    },
  });
  check('company job created (201)', created.status === 201, `got ${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);
  const jobId = created.json?.job?.id;
  check('job is company-type + pending', created.json?.job?.providerType === 'company' && created.json?.job?.status === 'pending');

  console.log('── 4. Company accepts + dispatches ──');
  const accept = await api(`/company/jobs/${jobId}/accept`, { method: 'POST', token: dispatcher.token });
  check('company accepts job', accept.status === 200 && accept.json?.job?.status === 'accepted', `got ${accept.status}`);

  const team = await api('/company/portal/team', { token: company.token });
  check('team list loads', team.status === 200 && Array.isArray(team.json?.team) && team.json.team.length >= 4);
  const techMember = team.json.team.find((m) => m.email === 'technician.demo@patafundi.test');

  const assign = await api(`/company/jobs/${jobId}/assign-technician`, {
    method: 'POST', token: dispatcher.token, body: { technicianMemberId: techMember.id },
  });
  check('dispatcher assigns technician', assign.status === 200 && assign.json?.job?.status === 'assigned', `got ${assign.status} ${JSON.stringify(assign.json).slice(0, 150)}`);
  check('assigned_by recorded', !!assign.json?.job?.assignedBy || !!assign.json?.job?.assigned_by);

  console.log('── 5. Cross-company isolation (IDOR attempt) ──');
  const outsider = await api(`/company/portal/overview`, { token: customer.token });
  check('customer blocked from company portal', outsider.status === 403, `got ${outsider.status}`);
  const fundiPortal = await api(`/company/portal/overview`, { token: (await login('fundi.demo@patafundi.test', PW)).token });
  check('fundi blocked from company portal', fundiPortal.status === 403, `got ${fundiPortal.status}`);

  console.log('── 6. Technician executes work ──');
  const assignments = await api('/company/technician/assignments?scope=active', { token: technician.token });
  check('technician sees assignment', assignments.status === 200 && assignments.json?.jobs?.some((j) => j.id === jobId));

  for (const status of ['on_the_way', 'arrived', 'in_progress']) {
    const r = await api(`/jobs/${jobId}/status`, { method: 'PATCH', token: technician.token, body: { status } });
    check(`technician sets ${status}`, r.status === 200, `got ${r.status}`);
  }
  const badTransition = await api(`/jobs/${jobId}/status`, { method: 'PATCH', token: technician.token, body: { status: 'on_the_way' } });
  check('invalid transition rejected (arrived → on_the_way)', badTransition.status === 400, `got ${badTransition.status}`);

  // Price tampering attempt: try to inflate final price — must be clamped
  const complete = await api(`/jobs/${jobId}/complete`, {
    method: 'POST', token: technician.token,
    body: { finalPrice: 99000 }, // tampered!
  });
  check('completion issues OTP', complete.status === 200 && complete.json?.completionOtpIssued === true, `got ${complete.status}`);
  const afterComplete = await api(`/jobs/${jobId}`, { token: customer.token });
  const clampedPrice = Number(afterComplete.json?.job?.finalPrice ?? afterComplete.json?.job?.final_price ?? 0);
  check('tampered final price clamped to ≤125% of estimate', clampedPrice <= 4000 * 1.25 + 1, `final=${clampedPrice}`);

  console.log('── 7. Payment + escrow + settlement ──');
  // The completion OTP is delivered to the CUSTOMER only (private user-room
  // socket + notification) — never in the technician's completion response.
  // The customer re-issues it via the customer-only completion-code endpoint.
  const otpRes = await api(`/jobs/${jobId}/completion-code`, { method: 'POST', token: customer.token });
  check('completion code issued to customer only', otpRes.status === 200 && !!otpRes.json?.completionOtp, `got ${otpRes.status}`);
  const techCodeAttempt = await api(`/jobs/${jobId}/completion-code`, { method: 'POST', token: technician.token });
  check('technician blocked from completion code', techCodeAttempt.status === 403 || techCodeAttempt.status === 400, `got ${techCodeAttempt.status}`);
  const otp = otpRes.json?.completionOtp;
  // pay via STK push (dev payment provider)
  const pay = await api('/payments/stk-push', {
    method: 'POST', token: customer.token,
    body: { jobId, amount: clampedPrice, mpesaNumber: '254730000001', idempotencyKey: `e2e_${jobId}` },
  });
  check('payment initiated', pay.status === 200 || pay.status === 201, `got ${pay.status} ${JSON.stringify(pay.json).slice(0, 150)}`);

  // simulate provider success callback (dev flow)
  if (pay.json?.checkoutRequestId || pay.json?.payment?.checkoutRequestId) {
    const cbId = pay.json?.checkoutRequestId || pay.json?.payment?.checkoutRequestId;
    const cb = await api('/payments/webhook', {
      method: 'POST',
      body: {
        Body: { stkCallback: { MerchantRequestID: pay.json?.merchantRequestId || pay.json?.payment?.merchantRequestId, CheckoutRequestID: cbId, ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: clampedPrice }, { Name: 'MpesaReceiptNumber', Value: 'E2EDEMO1' }] } } },
      },
    });
    check('payment webhook accepted', cb.status === 200 || cb.status === 201, `got ${cb.status}`);
  }

  const confirmed = await api(`/jobs/${jobId}/confirm-completion`, {
    method: 'POST', token: customer.token, body: { otp },
  });
  check('customer confirms with OTP', confirmed.status === 200, `got ${confirmed.status} ${JSON.stringify(confirmed.json).slice(0, 150)}`);

  // wait for auto-release
  await new Promise((r) => setTimeout(r, 1500));

  const finance = await api('/company/portal/finance', { token: company.token });
  check('company finance visible to owner', finance.status === 200, `got ${finance.status}`);
  const settlements = finance.json?.settlements || [];
  const ourSettlement = settlements.find((s) => s.job_id === jobId);
  check('settlement created for job', !!ourSettlement, `found ${settlements.length} settlements`);
  if (ourSettlement) {
    const gross = Number(ourSettlement.gross_amount);
    const commission = Number(ourSettlement.commission_amount);
    const net = Number(ourSettlement.net_amount);
    check('settlement math is server-authoritative (net = gross - commission, commission ≈ platform rate)',
      gross === clampedPrice && Math.abs(net - (gross - commission)) < 0.01 && Math.abs(commission - gross * 0.15) < 1,
      `gross=${gross} commission=${commission} net=${net} (expected commission ≈ ${Math.round(clampedPrice * 0.15)})`);
  }
  const dispatcherFinance = await api('/company/portal/finance', { token: dispatcher.token });
  check('dispatcher blocked from finance', dispatcherFinance.status === 403, `got ${dispatcherFinance.status}`);

  console.log('── 8. Review + staff/admin surfaces ──');
  const review = await api('/reviews', {
    method: 'POST', token: customer.token, body: { jobId, rating: 5, comment: 'E2E: great service.' },
  });
  check('review submitted', review.status === 201 || review.status === 200, `got ${review.status}`);

  const portal = await api('/company/portal/overview', { token: company.token });
  check('company portal overview', portal.status === 200 && portal.json?.company?.id === apex.id);
  check('portal has real stats', typeof portal.json?.stats?.totalJobs === 'number' && portal.json.stats.totalJobs >= 2);

  const adminCompanies = await api('/admin/companies', { token: superAdmin.token });
  check('admin lists companies', adminCompanies.status === 200 && adminCompanies.json?.companies?.length >= 1);
  const staffBlocked = await api('/admin/companies', { token: customer.token });
  check('customer blocked from admin', staffBlocked.status === 403, `got ${staffBlocked.status}`);

  const applications = await api('/admin/company-applications', { token: superAdmin.token });
  check('admin application queue', applications.status === 200 && Array.isArray(applications.json?.applications));

  console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
  if (failures.length) { console.log('FAILED:', failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
