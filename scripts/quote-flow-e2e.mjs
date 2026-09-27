// Live E2E: full quote workflow against the running dev API (spec section 53).
// Customer creates a booking -> company sends a quote -> verify the booking is
// NOT completed -> customer accepts -> booking_confirmed -> work runs ->
// completion requested -> customer confirms with OTP -> payment finalized ->
// booking completed. Also checks booking numbers and stats endpoints.
const BASE = process.env.PF_BASE || 'http://127.0.0.1:4000/api';

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const ok = (cond, label) => {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
};

async function main() {
  // 1) customer login (demo account)
  const login = await req('POST', '/auth/login', {
    body: { email: 'customer.demo@patafundi.test', password: 'PataFundi#2026' },
  });
  ok(login.status === 200 && login.json.token, 'customer login');
  const customerToken = login.json.token;

  // 2) resolve the demo company and create a company-targeted booking
  const clogin0 = await req('POST', '/auth/login', {
    body: { email: 'company.demo@patafundi.test', password: 'PataFundi#2026' },
  });
  ok(clogin0.status === 200 && clogin0.json.token, 'company login (pre-flight)');
  const profile = await req('GET', '/company/portal/profile', { token: clogin0.json.token });
  const companyId = profile.json.company?.id;
  ok(Boolean(companyId), 'demo company resolved');

  // 2b) Company verification workflow (spec sections 21-22, 47, 48, 53):
  // upload required documents -> submit for verification -> admin verifies
  // both documents -> the company becomes bookable.
  const adminLogin = await req('POST', '/auth/login', {
    body: { email: 'admin.demo@patafundi.test', password: 'PataFundi#2026' },
  });
  ok(adminLogin.status === 200 && adminLogin.json.token, 'admin login');
  const adminToken = adminLogin.json.token;

  // (owner account is super_admin and admin allowlisted)
  const docsInfo = await req('GET', '/company/documents', { token: clogin0.json.token });
  ok(docsInfo.status === 200 && Array.isArray(docsInfo.json.requiredDocuments), 'verification requirements resolved');
  const requiredDocs = docsInfo.json.requiredDocuments || [];
  for (const docType of requiredDocs) {
    const already = (docsInfo.json.documents || []).some(
      (d) => d.documentType === docType && ['verified', 'approved'].includes(d.status),
    );
    if (already) continue;
    // Upload via the document endpoint (base64-less: multipart via FormData)
    const fd = new FormData();
    fd.append('documentType', docType);
    fd.append('document', new Blob([Buffer.from('E2E test document for ' + docType)], { type: 'application/pdf' }), `${docType}.pdf`);
    const up = await fetch(`${BASE}/company/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clogin0.json.token}` },
      body: fd,
    });
    const upj = await up.json().catch(() => ({}));
    ok(up.status === 201 && upj.document?.id, `document uploaded: ${docType}`);
  }

  const submitVer = await req('POST', '/company/verification/submit', { token: clogin0.json.token });
  ok(submitVer.status === 200 && submitVer.json.company?.verification_status === 'under_review', 'submitted for verification (under_review)');

  // Admin sees the queue + a notification
  const queue = await req('GET', '/admin/verification/companies?status=under_review', { token: adminToken });
  ok(queue.status === 200 && (queue.json.companies || []).some((c) => c.id === companyId), 'company appears in admin verification queue');
  const adminNotifs = await req('GET', '/notifications?limit=20', { token: adminToken });
  ok((adminNotifs.json.notifications || []).some((n) => n.type === 'company_verification_submitted'), 'admin notification created');

  // Admin verifies each document, then the company
  const detail = await req('GET', `/admin/verification/companies/${companyId}`, { token: adminToken });
  const pendingDocs = (detail.json.documents || []).filter((d) => !['verified', 'approved'].includes(d.status));
  for (const doc of pendingDocs) {
    const rev = await req('POST', `/admin/verification/documents/${doc.id}/review`, {
      token: adminToken,
      body: { decision: 'verify' },
    });
    ok(rev.status === 200 && rev.json.document?.status === 'verified', `admin verified document: ${doc.documentType}`);
  }
  const verifyCo = await req('POST', `/admin/verification/companies/${companyId}/verify`, {
    token: adminToken,
    body: { decision: 'verify' },
  });
  ok(verifyCo.status === 200 && verifyCo.json.company?.verification_status === 'verified', 'company VERIFIED by admin');
  // Admin notification check happened above; company gets its own notification.
  const coNotifs = await req('GET', '/notifications?limit=20', { token: clogin0.json.token });
  ok((coNotifs.json.notifications || []).some((n) => n.type === 'company_verification_decision'), 'company received verification decision notification');

  const created = await req('POST', '/jobs', {
    token: customerToken,
    body: {
      serviceCategory: 'plumbing',
      description: 'E2E quote workflow: kitchen sink leaking under the cabinet',
      urgency: 'normal',
      latitude: -1.2921,
      longitude: 36.8219,
      formattedAddress: 'Test Tower, Nairobi',
      companyId,
    },
  });
  ok(created.status === 201 && created.json.job?.id, 'booking created');
  const job = created.json.job;
  ok(job.bookingNumber && /^PF-\d{4}-\d{6}$/.test(job.bookingNumber), `booking number backend-generated (${job.bookingNumber})`);

  // 3) company sends a quote (token from pre-flight login)
  const companyToken = clogin0.json.token;

  // find the job in the company portal incoming list
  const incoming = await req('GET', '/company/portal/jobs?scope=incoming', { token: companyToken });
  const target = (incoming.json.jobs || []).find((j) => j.id === job.id);
  ok(Boolean(target), 'booking appears in company incoming');

  const quoteRes = await req('POST', `/company/jobs/${job.id}/quote`, {
    token: companyToken,
    body: {
      amount: 4200,
      laborAmount: 3200,
      materialsAmount: 1000,
      estimatedDurationHours: 2.5,
      notes: 'Includes replacement washer and seal.',
      expiresInHours: 48,
    },
  });
  ok(quoteRes.status === 200 && quoteRes.json.quote?.status === 'sent', 'quote sent (entity status SENT)');
  ok(quoteRes.json.job?.status === 'offered', 'booking parked in quote phase (offered)');
  ok(quoteRes.json.job?.status !== 'completed', 'CRITICAL: quote does NOT complete the booking');

  // 4) customer views the quote
  const viewed = await req('GET', `/jobs/${job.id}/quote`, { token: customerToken });
  ok(viewed.status === 200 && ['sent', 'viewed'].includes(viewed.json.quote?.status), 'customer can fetch the live quote');
  ok(Number(viewed.json.quote?.amount) === 4200, 'quote amount matches');
  ok(viewed.json.quote?.companyName === 'Apex Home Services Ltd', 'quote shows company name');

  // 5) customer accepts the quote
  const accepted = await req('POST', `/jobs/${job.id}/quote/decision`, {
    token: customerToken,
    body: { decision: 'accept' },
  });
  ok(accepted.status === 200 && accepted.json.quote?.status === 'accepted', 'quote accepted');
  ok(accepted.json.job?.status === 'booking_confirmed', 'booking becomes BOOKING_CONFIRMED');
  ok(accepted.json.job?.status !== 'completed', 'accepting a quote does NOT complete the booking');

  // 6) company assigns a technician and runs the work
  const team = await req('GET', '/company/portal/team', { token: companyToken });
  const tech = (team.json.team || []).find((m) => m.role === 'technician' && m.status === 'active');
  if (tech) {
    const assigned = await req('POST', `/company/jobs/${job.id}/assign-technician`, {
      token: companyToken,
      body: { technicianMemberId: tech.id },
    });
    ok(assigned.status === 200 && assigned.json.job?.status === 'assigned', 'technician assigned');
  } else {
    console.log('SKIP: no active technician in demo team');
  }

  const moving = await req('PATCH', `/jobs/${job.id}/status`, {
    token: companyToken,
    body: { status: 'on_the_way' },
  });
  ok(moving.status === 200, 'professional on the way');
  const arrived = await req('PATCH', `/jobs/${job.id}/status`, {
    token: companyToken,
    body: { status: 'arrived' },
  });
  ok(arrived.status === 200, 'checked in');
  const started = await req('PATCH', `/jobs/${job.id}/status`, {
    token: companyToken,
    body: { status: 'in_progress' },
  });
  ok(started.status === 200, 'work in progress');

  // 7) provider marks completion requested
  const complete = await req('POST', `/jobs/${job.id}/complete`, { token: companyToken, body: {} });
  ok(complete.status === 200 && complete.json.job?.status === 'completion_requested', 'completion REQUESTED (not completed)');
  ok(Boolean(complete.json.completionOtpIssued), 'OTP issued to customer');

  // Fetch the OTP from the customer's notifications (dev-visible channel)
  const notifs = await req('GET', '/notifications?limit=10', { token: customerToken });
  const otpNotif = (notifs.json.notifications || []).find((n) => n.type === 'job_completion_otp');
  const otp = otpNotif?.data?.otp;
  ok(Boolean(otp), 'customer received the completion OTP');

  // Invalid OTP must be rejected
  const badConfirm = await req('POST', `/jobs/${job.id}/confirm-completion`, {
    token: customerToken,
    body: { otp: '000000' },
  });
  ok(badConfirm.status === 403 || badConfirm.json?.success === false, 'wrong OTP rejected');

  // 8) customer confirms with the OTP
  const confirm = await req('POST', `/jobs/${job.id}/confirm-completion`, {
    token: customerToken,
    body: { otp },
  });
  ok(confirm.status === 200, 'customer confirmed completion with OTP');
  ok(
    ['completed', 'customer_confirmed_completion'].includes(confirm.json.job?.status),
    `booking finalized via payment (${confirm.json.job?.status})`,
  );

  // 9) stats endpoint reflects the DB truth
  const stats = await req('GET', '/jobs/stats', { token: customerToken });
  ok(stats.status === 200 && Number.isFinite(stats.json.stats?.totalBookings), 'customer stats from DB');
  ok(Number(stats.json.stats?.completedJobs) >= 1, 'completed count includes the finished booking');

  // 10) open-pool regression check
  const pool = await req('GET', '/company/portal/open-pool', { token: companyToken });
  ok(pool.status === 200 && Array.isArray(pool.json.jobs), 'open-pool returns 200 (regression fixed)');

  console.log(process.exitCode ? 'E2E RESULT: FAILURES' : 'E2E RESULT: ALL PASS');
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
