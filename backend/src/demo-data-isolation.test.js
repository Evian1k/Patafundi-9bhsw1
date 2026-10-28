import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { query } from './db.js';
import { authRequired, signAccessToken } from './middleware/auth.js';
import { requireCompanyMember } from './middleware/companyAccess.js';
import { publicCompanyDirectory } from './controllers/companyController.js';
import { revenueDashboard } from './controllers/adminController.js';
import { summarizeDispute } from './controllers/aiAssistantController.js';
import { findNearbyFundis } from './services/geoMatchingService.js';
import { getBusinessAnalytics } from './services/enterpriseService3.js';
import { notifications as listNotifications } from './controllers/userController.js';
import { companyAvailableBalance } from './services/companyPayoutService.js';
import { canSeedDemoData } from './demoDataPolicy.js';
import { ensureDevDatabase, seedIfEmpty } from '../scripts/ensure-dev-db.js';
import { getPgPoolConfig } from './pg-config.js';
import { closeEmbeddedDb } from './pglite-instance.js';
import { executeRefundReversal } from './services/refundReversalService.js';
import { createChargeback, decideChargeback } from './controllers/chargebackController.js';
import { completePayout } from './controllers/payoutController.js';

const runId = randomUUID();

function mockResponse() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; this.statusCode ||= 200; return payload; },
  };
}

async function createUser({ name, role = 'customer', demo = false }) {
  const result = await query(
    `insert into users (email, password_hash, full_name, role, status, email_verified_at, is_demo)
     values ($1, 'isolated-test-hash', $2, $3, 'active', now(), $4)
     returning id, is_demo`,
    [`${name.toLowerCase().replaceAll(' ', '-')}-${runId}@example.co.ke`, name, role, demo],
  );
  return result.rows[0];
}

async function createCompany(ownerId, name) {
  const result = await query(
    `insert into company_profiles
       (owner_user_id, company_name, legal_name, contact_name, contact_email, contact_phone,
        business_categories, service_areas, status, verification_status, documents_status)
     values ($1, $2, $3, $2, $4, '254700000000', array['plumbing'], array['Nairobi'], 'approved', 'verified', 'verified')
     returning id, is_demo`,
    [ownerId, name, `${name} Ltd`, `${name.toLowerCase().replaceAll(' ', '-')}@example.co.ke`],
  );
  return result.rows[0];
}

async function createCompletedPayment({ label, demo = false, fundiId = null }) {
  const customer = await createUser({ name: `${label} Customer ${runId}`, demo });
  const job = (await query(
    `insert into jobs (customer_id, fundi_id, status, service_category, description, estimated_price, final_price)
     values ($1, $2, 'completed', 'plumbing', $3, 500, 500) returning id, is_demo`,
    [customer.id, fundiId, `${label} financial regression job`],
  )).rows[0];
  const payment = (await query(
    `insert into payments (job_id, customer_id, amount, status, escrow_status, idempotency_key)
     values ($1, $2, 500, 'completed', 'released', $3) returning id, is_demo`,
    [job.id, customer.id, `${label}-${runId}`],
  )).rows[0];
  return { customer, job, payment };
}

test.before(async () => {
  await ensureDevDatabase();
});

test.after(async () => {
  await closeEmbeddedDb();
});

test('demo seed policy fails closed for production and unsafe database targets', () => {
  assert.equal(canSeedDemoData({
    nodeEnv: 'production',
    embedded: '1',
    allowExternalTestSeed: 'true',
    databaseUrl: 'postgresql://localhost/patafundi_test',
  }), false);
  assert.equal(canSeedDemoData({
    nodeEnv: 'development',
    embedded: '0',
    allowExternalTestSeed: 'true',
    databaseUrl: 'postgresql://db.example.com/patafundi_test',
  }), false);
  assert.equal(canSeedDemoData({
    nodeEnv: 'test',
    embedded: '0',
    allowExternalTestSeed: 'true',
    databaseUrl: 'postgresql://localhost/patafundi_test_isolation',
  }), true);
  assert.equal(canSeedDemoData({
    nodeEnv: 'development',
    embedded: '1',
    allowExternalTestSeed: 'false',
  }), true);
});

test('production seed invocation does not insert development accounts', async (t) => {
  // This is a REAL integration test: it needs a live Postgres (CI's
  // postgres-integration job provides one via PATAFUNDI_TEST_DATABASE_URL).
  // Without infrastructure, skip honestly instead of reporting a false pass
  // or a confusing connection error.
  const probe = new pg.Pool(getPgPoolConfig(process.env.PATAFUNDI_TEST_DATABASE_URL));
  try {
    await probe.query('select 1');
  } catch (err) {
    await probe.end().catch(() => {});
    t.skip(`requires a reachable Postgres (PATAFUNDI_TEST_DATABASE_URL) — ${err.code || err.message}; covered by the CI postgres-integration job`);
    return;
  }
  await probe.end().catch(() => {});
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAllowDemoSeed = process.env.PATAFUNDI_ALLOW_DEMO_SEED;
  process.env.NODE_ENV = 'production';
  process.env.PATAFUNDI_ALLOW_DEMO_SEED = 'true';
  const seedDb = new pg.Pool(getPgPoolConfig(process.env.PATAFUNDI_TEST_DATABASE_URL));
  try {
    const before = Number((await seedDb.query('select count(*) from users')).rows[0].count);
    await seedIfEmpty(seedDb);
    const after = Number((await seedDb.query('select count(*) from users')).rows[0].count);
    assert.equal(after, before, 'production seed must leave user records unchanged');
  } finally {
    await seedDb.end();
    process.env.NODE_ENV = oldNodeEnv;
    if (oldAllowDemoSeed === undefined) delete process.env.PATAFUNDI_ALLOW_DEMO_SEED;
    else process.env.PATAFUNDI_ALLOW_DEMO_SEED = oldAllowDemoSeed;
  }
});

test('database provenance isolates demo providers, businesses, reviews, subscriptions, and revenue', async () => {
  const initialRevenueResponse = mockResponse();
  await revenueDashboard({}, initialRevenueResponse);
  const initialAnalytics = await getBusinessAnalytics('30d');
  const genuineCustomer = await createUser({ name: `Real Customer ${runId}` });
  const genuineReviewer = await createUser({ name: `Real Reviewer ${runId}` });
  const genuineFundi = await createUser({ name: `Real Fundi ${runId}`, role: 'fundi' });
  const demoCustomer = await createUser({ name: `Demo Customer ${runId}`, demo: true });
  const demoFundi = await createUser({ name: `Demo Fundi ${runId}`, role: 'fundi', demo: true });
  const genuineCompanyOwner = await createUser({ name: `Real Company Owner ${runId}` });
  const demoCompanyOwner = await createUser({ name: `Demo Company Owner ${runId}`, demo: true });

  assert.equal(genuineCustomer.is_demo, false, 'ordinary account must not be classified as synthetic');

  const fundiValues = [
    [genuineFundi.id, false],
    [demoFundi.id, true],
  ];
  for (const [userId] of fundiValues) {
    await query(
      `insert into fundis
         (user_id, skills, approval_status, online, latitude, longitude, rating, verification_badge)
       values ($1, array['plumbing'], 'approved', true, -1.2864, 36.8172, 4.9, true)`,
      [userId],
    );
  }
  const fundiMarkers = await query('select user_id, is_demo from fundis where user_id = any($1::uuid[])', [
    fundiValues.map(([userId]) => userId),
  ]);
  assert.deepEqual(
    Object.fromEntries(fundiMarkers.rows.map((row) => [row.user_id, row.is_demo])),
    Object.fromEntries(fundiValues),
  );

  const candidates = await findNearbyFundis({
    latitude: -1.2864,
    longitude: 36.8172,
    serviceCategory: 'plumbing',
    customerId: genuineCustomer.id,
  });
  const candidateIds = candidates.map((candidate) => candidate.user_id);
  assert.ok(candidateIds.includes(genuineFundi.id), 'a genuine eligible fundi remains searchable');
  assert.ok(!candidateIds.includes(demoFundi.id), 'synthetic fundis never appear in matching');

  const genuineCompany = await createCompany(genuineCompanyOwner.id, `Verified Company ${runId}`);
  const demoCompany = await createCompany(demoCompanyOwner.id, `Demo Company ${runId}`);
  assert.equal(genuineCompany.is_demo, false);
  assert.equal(demoCompany.is_demo, true, 'company inherits provenance from its owner');
  const ordinaryMember = await createUser({ name: `Ordinary Company Member ${runId}` });
  await query(
    `insert into company_members (company_id, user_id, role, status)
     values ($1, $2, 'technician', 'active')`,
    [demoCompany.id, ordinaryMember.id],
  );
  let companyAccessError;
  await requireCompanyMember()(
    { params: { companyId: demoCompany.id }, user: ordinaryMember },
    {},
    (error) => { companyAccessError = error; },
  );
  assert.equal(companyAccessError?.status, 404, 'ordinary members cannot access a demo company portal');

  const genuineJob = (await query(
    `insert into jobs (customer_id, company_id, status, service_category, description, estimated_price)
     values ($1, $2, 'completed', 'plumbing', 'Genuine isolation test job', 300) returning id, is_demo`,
    [genuineCustomer.id, genuineCompany.id],
  )).rows[0];
  const demoJob = (await query(
    `insert into jobs (customer_id, company_id, status, service_category, description, estimated_price)
     values ($1, $2, 'completed', 'synthetic-only', 'Synthetic isolation test job', 30000) returning id, is_demo`,
    [demoCustomer.id, genuineCompany.id],
  )).rows[0];
  assert.equal(genuineJob.is_demo, false);
  assert.equal(demoJob.is_demo, true, 'jobs inherit provenance from any synthetic participant');

  const demoNotification = (await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'demo_job', 'Synthetic job', 'Synthetic activity', $2::jsonb) returning id`,
    [genuineCustomer.id, JSON.stringify({ jobId: demoJob.id })],
  )).rows[0];
  const demoAccountNotification = (await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'demo_job', 'Synthetic job', 'Synthetic activity', $2::jsonb) returning id`,
    [demoCustomer.id, JSON.stringify({ jobId: demoJob.id })],
  )).rows[0];
  const genuineNotificationResponse = mockResponse();
  await listNotifications({ user: genuineCustomer }, genuineNotificationResponse);
  assert.ok(
    genuineNotificationResponse.payload.notifications.every((item) => item.id !== demoNotification.id),
    'synthetic notifications do not enter a genuine account inbox',
  );
  const demoNotificationResponse = mockResponse();
  await listNotifications({ user: demoCustomer }, demoNotificationResponse);
  assert.ok(
    demoNotificationResponse.payload.notifications.some((item) => item.id === demoAccountNotification.id),
    'demo accounts retain their isolated development notifications',
  );

  await query(
    `insert into reviews (job_id, reviewer_id, rating, comment)
     values ($1, $2, 5, 'Genuine review'), ($3, $4, 1, 'Synthetic review')`,
    [genuineJob.id, genuineReviewer.id, demoJob.id, demoCustomer.id],
  );
  await query(
    `insert into subscriptions (fundi_id, plan, amount, status, starts_at, expires_at, subscriber_type, is_demo)
     values ($1, 'monthly', 1000, 'active', now(), now() + interval '30 days', 'company', true)`,
    [genuineCompanyOwner.id],
  );
  await query(
    `insert into payments (job_id, customer_id, amount, status, escrow_status, idempotency_key)
     values ($1, $2, 300, 'completed', 'released', $3),
            ($4, $5, 30000, 'completed', 'released', $6)`,
    [genuineJob.id, genuineCustomer.id, `real-${runId}`, demoJob.id, demoCustomer.id, `demo-${runId}`],
  );
  await query(
    `insert into revenue_ledger (job_id, transaction_type, entry_type, amount, currency, user_id, notes)
     values ($1, 'commission_earned', 'commission', 30, 'KES', $2, $5),
            ($3, 'commission_earned', 'commission', 3000, 'KES', $4, $6)`,
    [
      genuineJob.id,
      genuineCustomer.id,
      demoJob.id,
      demoCustomer.id,
      `real test revenue ${runId}`,
      `demo test revenue ${runId}`,
    ],
  );
  const demoDispute = (await query(
    `insert into disputes (job_id, opened_by, reason) values ($1, $2, 'Synthetic dispute') returning id`,
    [demoJob.id, demoCustomer.id],
  )).rows[0];
  await assert.rejects(
    summarizeDispute({ body: { disputeId: demoDispute.id } }, mockResponse()),
    (error) => error.status === 404,
    'AI dispute summaries exclude demo disputes',
  );

  const paymentMarkers = await query(
    `select job_id, is_demo from payments
     where idempotency_key in ($1, $2) order by is_demo`,
    [`real-${runId}`, `demo-${runId}`],
  );
  assert.deepEqual(paymentMarkers.rows.map((row) => row.is_demo), [false, true]);
  const ledgerMarkers = await query(
    `select job_id, is_demo from revenue_ledger
     where notes in ($1, $2) order by is_demo`,
    [`real test revenue ${runId}`, `demo test revenue ${runId}`],
  );
  assert.deepEqual(ledgerMarkers.rows.map((row) => row.is_demo), [false, true]);

  const oldRequireSubscription = process.env.REQUIRE_COMPANY_SUBSCRIPTION;
  process.env.REQUIRE_COMPANY_SUBSCRIPTION = 'true';
  try {
    const directoryResponse = mockResponse();
    await publicCompanyDirectory({ query: {} }, directoryResponse);
    assert.ok(
      !directoryResponse.payload.companies.some((company) => company.id === genuineCompany.id),
      'a demo subscription cannot enable a genuine company listing',
    );
    assert.ok(
      !directoryResponse.payload.companies.some((company) => company.id === demoCompany.id),
      'a demo company is never listed as a genuine business',
    );

    await query(
      `insert into subscriptions (fundi_id, plan, amount, status, starts_at, expires_at, subscriber_type)
       values ($1, 'monthly', 1000, 'active', now(), now() + interval '30 days', 'company')`,
      [genuineCompanyOwner.id],
    );
    const eligibleResponse = mockResponse();
    await publicCompanyDirectory({ query: {} }, eligibleResponse);
    const eligibleCompany = eligibleResponse.payload.companies.find((company) => company.id === genuineCompany.id);
    assert.ok(eligibleCompany, 'a genuine company with a genuine subscription remains discoverable');
    assert.ok(!eligibleResponse.payload.companies.some((company) => company.id === demoCompany.id));
    assert.equal(eligibleCompany.rating, 5);
    assert.equal(eligibleCompany.reviewCount, 1);
  } finally {
    if (oldRequireSubscription === undefined) delete process.env.REQUIRE_COMPANY_SUBSCRIPTION;
    else process.env.REQUIRE_COMPANY_SUBSCRIPTION = oldRequireSubscription;
  }

  const revenueResponse = mockResponse();
  await revenueDashboard({}, revenueResponse);
  assert.equal(
    revenueResponse.payload.totals.lifetimeRevenue - initialRevenueResponse.payload.totals.lifetimeRevenue,
    30,
  );
  assert.equal(
    revenueResponse.payload.totals.commissionRevenue - initialRevenueResponse.payload.totals.commissionRevenue,
    30,
  );

  const analytics = await getBusinessAnalytics('30d');
  assert.equal(Number(analytics.summary.revenue) - Number(initialAnalytics.summary.revenue), 300);
  assert.ok(analytics.topServices.every((row) => row.service_category !== 'synthetic-only'));

  await query(
    `insert into company_settlements
       (company_id, job_id, gross_amount, commission_amount, net_amount, status)
     values ($1, $2, 100, 10, 90, 'pending'), ($1, $3, 30000, 3000, 27000, 'pending')`,
    [genuineCompany.id, genuineJob.id, demoJob.id],
  );
  await query(
    `insert into payouts (company_id, amount, net_amount, status, idempotency_key)
     values ($1, $2, $2, 'requested', $3)`,
    [genuineCompany.id, 25, `genuine-payout-${runId}`],
  );
  assert.equal(
    await companyAvailableBalance(null, genuineCompany.id),
    65,
    'settlement balance includes genuine funds and excludes demo settlement activity',
  );
  assert.equal(
    await companyAvailableBalance(null, demoCompany.id),
    0,
    'demo-company settlement funds are unavailable for genuine payouts',
  );

  const cascadeCustomer = await createUser({ name: `Reclassified Customer ${runId}` });
  const cascadeJob = (await query(
    `insert into jobs (customer_id, status, service_category, description, estimated_price)
     values ($1, 'completed', 'plumbing', 'Reclassification cascade fixture', 100) returning id`,
    [cascadeCustomer.id],
  )).rows[0];
  const cascadePayment = (await query(
    `insert into payments (job_id, customer_id, amount, status, idempotency_key)
     values ($1, $2, 100, 'completed', $3) returning id`,
    [cascadeJob.id, cascadeCustomer.id, `cascade-${runId}`],
  )).rows[0];
  await query(
    `insert into revenue_ledger (job_id, transaction_type, entry_type, amount, currency, user_id, notes)
     values ($1, 'commission_earned', 'commission', 10, 'KES', $2, 'cascade test revenue')`,
    [cascadeJob.id, cascadeCustomer.id],
  );
  await query('update users set is_demo = true where id = $1', [cascadeCustomer.id]);
  const cascaded = await query(
    `select j.is_demo as job_demo, p.is_demo as payment_demo, r.is_demo as ledger_demo
     from jobs j join payments p on p.job_id = j.id
     join revenue_ledger r on r.job_id = j.id
     where j.id = $1 and p.id = $2 and r.notes = 'cascade test revenue'`,
    [cascadeJob.id, cascadePayment.id],
  );
  assert.deepEqual(cascaded.rows[0], { job_demo: true, payment_demo: true, ledger_demo: true });
});

test('production authentication rejects demo users with previously issued access tokens', async () => {
  const demoUser = (await query('select id, email, role from users where is_demo = true limit 1')).rows[0];
  assert.ok(demoUser);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const req = {
      method: 'GET',
      path: '/api/users/me',
      originalUrl: '/api/users/me',
      headers: {},
      get(name) { return name.toLowerCase() === 'authorization' ? `Bearer ${signAccessToken(demoUser)}` : null; },
    };
    let authError;
    await authRequired(req, {}, (error) => { authError = error; });
    assert.equal(authError?.status, 403);
    assert.equal(req.user, undefined);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test('refund reversal excludes demo payments, rejects partial amounts, and is one-time', async () => {
  const admin = await createUser({ name: `Refund Admin ${runId}`, role: 'admin' });
  const demoFixture = await createCompletedPayment({ label: 'demo-refund', demo: true });
  await assert.rejects(
    executeRefundReversal({
      jobId: demoFixture.job.id,
      reason: 'Synthetic payment must not be refunded through real finance tools',
      actorId: admin.id,
      notifyCustomer: false,
    }),
    (error) => error.status === 400,
  );
  const demoPayment = await query('select status from payments where id = $1', [demoFixture.payment.id]);
  assert.equal(demoPayment.rows[0].status, 'completed');

  const genuineFixture = await createCompletedPayment({ label: 'genuine-refund' });
  const settlementCompanyOwner = await createUser({ name: `Refund Settlement Owner ${runId}` });
  const settlementCompany = await createCompany(settlementCompanyOwner.id, `Refund Settlement Company ${runId}`);
  await query(
    `insert into company_settlements (company_id, job_id, gross_amount, commission_amount, net_amount, status)
     values ($1, $2, 500, 50, 450, 'pending')`,
    [settlementCompany.id, genuineFixture.job.id],
  );
  await assert.rejects(
    executeRefundReversal({
      jobId: genuineFixture.job.id,
      reason: 'Partial refunds are not supported',
      amount: 125,
      actorId: admin.id,
      notifyCustomer: false,
    }),
    /Partial refunds are not supported/,
  );
  const refund = await executeRefundReversal({
    jobId: genuineFixture.job.id,
    reason: 'Verified full refund in isolated test database',
    actorId: admin.id,
    notifyCustomer: false,
  });
  assert.equal(refund.amount, 500);
  const persisted = await query(
    `select p.status as payment_status, p.escrow_status, j.payment_status as job_payment_status,
            (select count(*)::int from revenue_ledger r
             where r.job_id = j.id and r.payment_id = p.id
               and r.entry_type = 'refund' and r.transaction_type = 'refund') as refund_entries,
            (select status from company_settlements where job_id = j.id) as settlement_status
     from payments p join jobs j on j.id = p.job_id where p.id = $1`,
    [genuineFixture.payment.id],
  );
  assert.deepEqual(persisted.rows[0], {
    payment_status: 'refunded',
    escrow_status: 'refunded',
    job_payment_status: 'refunded',
    refund_entries: 1,
    settlement_status: 'cancelled',
  });
  await assert.rejects(
    executeRefundReversal({
      jobId: genuineFixture.job.id,
      reason: 'Repeated request must not post a second refund',
      actorId: admin.id,
      notifyCustomer: false,
    }),
    /No completed payment found/,
  );
  const refundCount = await query(
    `select count(*)::int as count from revenue_ledger where job_id = $1 and transaction_type = 'refund'`,
    [genuineFixture.job.id],
  );
  assert.equal(refundCount.rows[0].count, 1);
});

test('chargebacks require a genuine completed payment and validated amount/currency', async () => {
  const admin = await createUser({ name: `Chargeback Admin ${runId}`, role: 'admin' });
  const genuineFixture = await createCompletedPayment({ label: 'genuine-chargeback' });
  const demoFixture = await createCompletedPayment({ label: 'demo-chargeback', demo: true });
  const createRequest = (fixture, body) => ({
    body: { paymentId: fixture.payment.id, amount: 250, currency: 'KES', reason: 'Provider dispute', ...body },
    user: { id: admin.id },
  });
  const invalidAmountResponse = mockResponse();
  await assert.rejects(
    createChargeback(createRequest(genuineFixture, { amount: 501 }), invalidAmountResponse),
    /exceeds the payment amount/,
  );
  await assert.rejects(
    createChargeback(createRequest(genuineFixture, { currency: 'USD' }), mockResponse()),
    /currency must match/,
  );
  await assert.rejects(
    createChargeback(createRequest(demoFixture, {}), mockResponse()),
    (error) => error.status === 404,
  );

  const createdResponse = mockResponse();
  await createChargeback(createRequest(genuineFixture, { amount: 250, providerReference: `cb-${runId}` }), createdResponse);
  assert.equal(createdResponse.statusCode, 201);
  const chargebackId = createdResponse.payload.chargeback.id;
  const decisionResponse = mockResponse();
  await decideChargeback(
    { params: { id: chargebackId }, body: { status: 'under_review' }, user: { id: admin.id } },
    decisionResponse,
  );
  assert.equal(decisionResponse.payload.chargeback.status, 'under_review');
  const persisted = await query('select is_demo, amount, currency, status from payment_chargebacks where id = $1', [chargebackId]);
  assert.deepEqual(persisted.rows[0], { is_demo: false, amount: '250.00', currency: 'KES', status: 'under_review' });
});

test('payout completion is demo-filtered and repeat requests do not change financial state', async () => {
  const admin = await createUser({ name: `Payout Admin ${runId}`, role: 'admin' });
  const fundi = await createUser({ name: `Payout Fundi ${runId}`, role: 'fundi' });
  const genuineFixture = await createCompletedPayment({ label: 'genuine-payout', fundiId: fundi.id });
  const payout = (await query(
    `insert into payouts (job_id, fundi_id, amount, status, idempotency_key)
     values ($1, $2, 450, 'requested', $3) returning id`,
    [genuineFixture.job.id, fundi.id, `payout-${runId}`],
  )).rows[0];
  const request = {
    params: { id: payout.id },
    body: { providerReference: `test-bookkeeping-${runId}` },
    user: { id: admin.id, role: 'admin' },
  };
  const completedResponse = mockResponse();
  await completePayout(request, completedResponse);
  assert.equal(completedResponse.payload.payout.status, 'completed');
  assert.equal(completedResponse.payload.payout.provider_reference, `test-bookkeeping-${runId}`);
  const repeatedResponse = mockResponse();
  await completePayout(request, repeatedResponse);
  assert.equal(repeatedResponse.payload.payout.status, 'completed');
  const payoutCount = await query('select count(*)::int as count from payouts where idempotency_key = $1', [`payout-${runId}`]);
  assert.equal(payoutCount.rows[0].count, 1);

  const demoPayout = (await query(
    `insert into payouts (fundi_id, amount, status, idempotency_key, is_demo)
     values ($1, 450, 'requested', $2, true) returning id`,
    [fundi.id, `demo-payout-${runId}`],
  )).rows[0];
  await assert.rejects(
    completePayout({
      params: { id: demoPayout.id },
      body: { providerReference: `demo-transfer-${runId}` },
      user: { id: admin.id, role: 'admin' },
    }, mockResponse()),
    /Payout not found/,
  );
  const demoStatus = await query('select status from payouts where id = $1', [demoPayout.id]);
  assert.equal(demoStatus.rows[0].status, 'requested');

  const companyOwner = await createUser({ name: `Company Payout Owner ${runId}` });
  const company = await createCompany(companyOwner.id, `Company Payout ${runId}`);
  const companySettlement = await query(
    `insert into company_settlements (company_id, job_id, gross_amount, commission_amount, net_amount, status)
     values ($1, $2, 100, 10, 90, 'pending') returning id`,
    [company.id, genuineFixture.job.id],
  );
  const mismatchedCompanyPayout = (await query(
    `insert into payouts (company_id, amount, net_amount, status, idempotency_key)
     values ($1, 25, 25, 'requested', $2) returning id`,
    [company.id, `partial-company-payout-${runId}`],
  )).rows[0];
  await assert.rejects(
    completePayout({
      params: { id: mismatchedCompanyPayout.id },
      body: { providerReference: `unmatched-${runId}` },
      user: { id: admin.id, role: 'admin' },
    }, mockResponse()),
    /does not match whole pending settlements/,
  );
  const unpaidPayout = await query(
    `select p.status as payout_status, s.status as settlement_status
     from payouts p join company_settlements s on s.company_id = p.company_id
     where p.id = $1 and s.id = $2`,
    [mismatchedCompanyPayout.id, companySettlement.rows[0].id],
  );
  assert.deepEqual(unpaidPayout.rows[0], { payout_status: 'requested', settlement_status: 'pending' });

  const validCompanyPayout = (await query(
    `insert into payouts (company_id, amount, net_amount, status, idempotency_key)
     values ($1, 90, 90, 'requested', $2) returning id`,
    [company.id, `whole-company-payout-${runId}`],
  )).rows[0];
  await completePayout({
    params: { id: validCompanyPayout.id },
    body: { providerReference: `whole-settlement-${runId}` },
    user: { id: admin.id, role: 'admin' },
  }, mockResponse());
  const paidSettlement = await query(
    `select p.status as payout_status, s.status as settlement_status, s.payout_reference
     from payouts p join company_settlements s on s.company_id = p.company_id
     where p.id = $1 and s.id = $2`,
    [validCompanyPayout.id, companySettlement.rows[0].id],
  );
  assert.deepEqual(paidSettlement.rows[0], {
    payout_status: 'completed',
    settlement_status: 'paid',
    payout_reference: `whole-settlement-${runId}`,
  });
});
