// Regression + lifecycle tests for the production correction pass:
//   1) open-pool PostgreSQL parameter-type bug (spec section 28)
//   2) quote lifecycle: a quote NEVER completes a job (spec sections 1, 49)
//   3) booking numbers: backend-generated, permanent, collision-safe (section 9)
//   4) job stats come from the DB (section 7)
import assert from 'node:assert/strict';
import test from 'node:test';
import { query } from './db.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { portalOpenPool } from './controllers/companyController.js';
import { transitionJob, assertTransitionAllowed, JOB_TRANSITIONS } from './services/jobStateMachine.js';
import { createQuote, decideQuote, getLiveQuoteForJob } from './services/quoteService.js';
import { getJobStats } from './controllers/jobController.js';

test.before(async () => {
  await ensureDevDatabase();
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('open-pool runs with empty AND non-empty category arrays (regression: could not determine data type of parameter)', async () => {
  const companies = await query(
    `select cp.id, cp.owner_user_id, cp.business_categories, cp.service_areas
     from company_profiles cp order by cp.created_at desc limit 1`,
  );
  const company = companies.rows[0];
  if (!company) return; // no company in DB - nothing to assert

  // WITH the company's real categories (possibly empty array branch).
  const res1 = mockRes();
  await portalOpenPool(
    { company, params: {}, query: {} },
    res1,
  );
  assert.equal(res1.statusCode, 200);
  assert.ok(Array.isArray(res1.body.jobs), 'open-pool must return a jobs array');

  // Explicit empty-array branch (the historical 500 trigger).
  const res2 = mockRes();
  await portalOpenPool(
    { company: { ...company, business_categories: [], service_areas: [] }, params: {}, query: {} },
    res2,
  );
  assert.equal(res2.statusCode, 200, 'empty categories must not produce a 500');
  assert.ok(Array.isArray(res2.body.jobs));
});

test('quote lifecycle: sending a quote never completes a job and acceptance confirms the booking', async () => {
  const customer = (await query(
    `select id, email, role from users where role = 'customer' order by created_at desc limit 1`,
  )).rows[0];
  assert.ok(customer, 'a customer account must exist');
  const inserted = await query(
    `insert into jobs (customer_id, service_category, description, status, provider_type, estimated_price)
     values ($1, 'plumbing', 'quote lifecycle test job', 'pending', 'company', 3000) returning *`,
    [customer.id],
  );
  const job = inserted.rows[0];
  const actor = { id: customer.id, role: 'customer', isAdmin: false };

  // 1) A quote-phase state has NO edge to completion/payment states.
  for (const illegal of ['completed', 'closed', 'payment_confirmed', 'customer_confirmed_completion', 'in_progress']) {
    assert.throws(() => assertTransitionAllowed('offered', illegal), /Invalid status transition|quote does not complete/);
    assert.throws(() => assertTransitionAllowed('quote_requested', illegal), /Invalid status transition|quote does not complete/);
  }

  // 2) Sending a quote creates a SENT quote and parks the job as offered.
  const quote = await createQuote({
    jobId: job.id, actor, companyId: null, fundiId: null,
    amount: 3500, laborAmount: 2500, materialsAmount: 1000,
    estimatedDurationHours: 3, notes: 'includes parts',
  });
  assert.equal(quote.status, 'sent');
  assert.equal(Number(quote.amount), 3500);
  const afterSend = (await query('select status from jobs where id = $1', [job.id])).rows[0];
  assert.equal(afterSend.status, 'offered', 'sending a quote must park the job in the quote phase, not completed');

  // 3) Accepting the quote moves the booking to booking_confirmed - NOT completed.
  const decided = await decideQuote({ jobId: job.id, decision: 'accept', customer: actor });
  assert.equal(decided.quote.status, 'accepted');
  assert.equal(decided.job.status, 'booking_confirmed');
  const afterAccept = (await query('select status from jobs where id = $1', [job.id])).rows[0];
  assert.equal(afterAccept.status, 'booking_confirmed');
  assert.notEqual(afterAccept.status, 'completed');

  // 4) Decline path returns the booking to matching (still available).
  const job2 = (await query(
    `insert into jobs (customer_id, service_category, description, status, provider_type, estimated_price)
     values ($1, 'electrical', 'quote decline test job', 'pending', 'company', 2000) returning *`,
    [customer.id],
  )).rows[0];
  const quote2 = await createQuote({ jobId: job2.id, actor, amount: 2500 });
  const declined = await decideQuote({ jobId: job2.id, decision: 'decline', customer: actor });
  assert.equal(declined.quote.status, 'declined');
  assert.equal(declined.job.status, 'matching', 'a declined quote keeps the booking available');
  const job2Status = (await query('select status from jobs where id = $1', [job2.id])).rows[0];
  assert.notEqual(job2Status.status, 'completed');

  // 5) The live-quote lookup marks nothing completed either.
  const live = await getLiveQuoteForJob(job.id);
  assert.equal(live.status, 'accepted');
  await query('delete from jobs where id in ($1, $2)', [job.id, job2.id]);
});

test('booking numbers are backend-generated, human readable and collision-safe', async () => {
  const customer = (await query(`select id from users where role = 'customer' order by created_at desc limit 1`)).rows[0];
  const a = (await query(
    `insert into jobs (customer_id, service_category, description, status) values ($1, 'plumbing', 'booking number test', 'pending') returning *`,
    [customer.id],
  )).rows[0];
  const b = (await query(
    `insert into jobs (customer_id, service_category, description, status) values ($1, 'cleaning', 'booking number test 2', 'pending') returning *`,
    [customer.id],
  )).rows[0];
  for (const job of [a, b]) {
    assert.ok(job.booking_number, 'booking number must be generated by the backend');
    assert.match(job.booking_number, /^PF-\d{4}-\d{6}$/, `format PF-YYYY-NNNNNN expected, got ${job.booking_number}`);
  }
  assert.notEqual(a.booking_number, b.booking_number, 'booking numbers must be unique');
  await query('delete from jobs where id in ($1, $2)', [a.id, b.id]);
});

test('job stats are computed from the database', async () => {
  const customer = (await query(`select id, role from users where role = 'customer' order by created_at desc limit 1`)).rows[0];
  const res = mockRes();
  await getJobStats({ user: { id: customer.id, role: 'customer' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  const stats = res.body.stats;
  for (const key of ['totalBookings', 'activeJobs', 'completedJobs', 'pendingQuotes', 'cancelledJobs', 'disputedJobs']) {
    assert.ok(Number.isFinite(Number(stats[key])), `${key} must be a number`);
  }
  // Cross-check against a direct DB count.
  const direct = (await query(
    `select count(*) as n from jobs where customer_id = $1 and status in ('payment_confirmed','completed','closed')`,
    [customer.id],
  )).rows[0];
  assert.equal(Number(stats.completedJobs), Number(direct.n));
});

test('central state machine rejects scattered invalid transitions', () => {
  assert.ok(JOB_TRANSITIONS.completed.every((t) => ['closed', 'disputed', 'refund_requested'].includes(t)));
  assert.ok(JOB_TRANSITIONS.closed.length === 0, 'closed is terminal');
  assert.throws(() => assertTransitionAllowed('completed', 'pending'));
  assert.throws(() => assertTransitionAllowed('closed', 'in_progress'));
  assert.doesNotThrow(() => assertTransitionAllowed('in_progress', 'completion_requested'));
  assert.doesNotThrow(() => assertTransitionAllowed('completion_requested', 'customer_confirmed_completion'));
});
