import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { config } from './config.js';
import { query, transaction } from './db.js';
import { completeJob, confirmCompletion } from './controllers/jobController.js';
import { recordUnexpectedSuccessfulPayment, reviewPaymentReconciliation, webhook } from './controllers/paymentController.js';
import { recoverStaleRunningJobs } from './queueWorker.js';

test.before(async () => {
  await ensureDevDatabase();
});

async function createCompletionFixture({ heldPayment = false, status = 'completion_requested' } = {}) {
  const customer = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const fundi = (await query('select id from users where email = $1', ['fundi@patafundi.com'])).rows[0];
  assert.ok(customer, 'isolated test customer is seeded');
  assert.ok(fundi, 'isolated test Fundi is seeded');

  const otp = String(crypto.randomInt(100000, 999999));
  const hash = await bcrypt.hash(otp, 4);
  const inserted = await query(
    `insert into jobs (customer_id, fundi_id, service_category, description, status,
       payment_status, escrow_status, estimated_price, final_price, completion_otp_hash)
     values ($1, $2, 'plumbing', 'Isolated completion lifecycle regression',
       $3, $4, $5, 1000, 1000, $6)
     returning id, booking_number`,
    [customer.id, fundi.id, status, heldPayment ? 'escrow_held' : 'pending', heldPayment ? 'held' : 'none', hash],
  );
  const job = inserted.rows[0];

  if (heldPayment) {
    const payment = await query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, commission_rate)
       values ($1, $2, 1000, 'KES', 'completed', 'held', $3, 0.10)
       returning id`,
      [job.id, customer.id, `completion-test-${crypto.randomUUID()}`],
    );
    await query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       values ($1, $2, 'hold', 1000, 'held')`,
      [job.id, payment.rows[0].id],
    );
    await query(
      `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
       values ($1, $2, $3, 1000, 'escrow_held')`,
      [job.id, customer.id, fundi.id],
    );
  }

  return { job, customer, fundi, otp };
}

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

async function confirm({ jobId, customerId, otp }) {
  const res = responseRecorder();
  await confirmCompletion({
    params: { id: jobId },
    body: { otp },
    user: { id: customerId, role: 'customer' },
  }, res);
  return res;
}

function verifiedLoopbackCallback(checkoutRequestId, receipt) {
  const body = {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: { Item: [
          { Name: 'Amount', Value: 1000 },
          { Name: 'MpesaReceiptNumber', Value: receipt },
        ] },
      },
    },
  };
  return {
    body,
    rawBody: JSON.stringify(body),
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get(name) { return name === 'x-mpesa-callback-secret' ? config.mpesa.callbackSecret || undefined : undefined; },
  };
}

test('a verified delayed Daraja success resolves an uncertain initiation and applies one escrow hold', async () => {
  const { job, customer } = await createCompletionFixture({ status: 'payment_pending' });
  const checkoutRequestId = `CHECKOUT-${crypto.randomUUID()}`;
  const payment = (await query(
    `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
       idempotency_key, checkout_request_id, provider_response)
     values ($1, $2, 1000, 'KES', 'reconciliation_required', 'pending', $3, $4, $5::jsonb)
     returning id`,
    [job.id, customer.id, `uncertain-callback-${crypto.randomUUID()}`, checkoutRequestId,
      JSON.stringify({ provider: 'mpesa', stage: 'stk_initiation', outcome: 'unknown' })],
  )).rows[0];
  const res = responseRecorder();
  await webhook(verifiedLoopbackCallback(checkoutRequestId, `RECEIPT-${crypto.randomUUID()}`), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  const row = (await query('select status, escrow_status from payments where id = $1', [payment.id])).rows[0];
  assert.deepEqual(row, { status: 'completed', escrow_status: 'held' });
  assert.equal((await query('select count(*)::int as n from escrow_transactions where payment_id = $1 and type = \'hold\'', [payment.id])).rows[0].n, 1);
  assert.equal((await query('select count(*)::int as n from accounting_ledger where source_id = $1', [payment.id])).rows[0].n, 2);
  assert.equal((await query('select count(*)::int as n from processed_webhook_callbacks where checkout_request_id = $1', [checkoutRequestId])).rows[0].n, 1);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});

test('a verified callback arriving after finance authorizes a retry is quarantined instead of silently ignored or auto-settled', async () => {
  const { job, customer } = await createCompletionFixture({ status: 'payment_pending' });
  const checkoutRequestId = `CHECKOUT-${crypto.randomUUID()}`;
  const payment = (await query(
    `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
       idempotency_key, checkout_request_id, provider_response)
     values ($1, $2, 1000, 'KES', 'reconciliation_required', 'pending', $3, $4, $5::jsonb)
     returning id`,
    [job.id, customer.id, `reviewed-callback-${crypto.randomUUID()}`, checkoutRequestId,
      JSON.stringify({ provider: 'mpesa', stage: 'stk_initiation', outcome: 'unknown' })],
  )).rows[0];
  const review = responseRecorder();
  await reviewPaymentReconciliation({
    params: { paymentId: payment.id },
    body: { action: 'confirm_no_charge', evidenceReference: 'DARAJA-QUERY-REF-2001' },
    user: { id: customer.id, role: 'finance_team' },
  }, review);
  assert.equal(review.payload.payment.status, 'failed');

  const res = responseRecorder();
  await webhook(verifiedLoopbackCallback(checkoutRequestId, `LATE-RECEIPT-${crypto.randomUUID()}`), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.status, 'reconciliation_required');
  const row = (await query('select status, escrow_status, provider_amount from payments where id = $1', [payment.id])).rows[0];
  assert.equal(row.status, 'reconciliation_required');
  assert.equal(row.escrow_status, 'pending');
  assert.equal(Number(row.provider_amount), 1000);
  assert.equal((await query('select count(*)::int as n from escrow_transactions where payment_id = $1', [payment.id])).rows[0].n, 0);
  assert.equal((await query('select count(*)::int as n from accounting_ledger where source_id = $1', [payment.id])).rows[0].n, 0);
  assert.equal((await query(
    `select count(*)::int as n from audit_logs where action = 'payment.reconciliation_required' and entity_id = $1`,
    [payment.id],
  )).rows[0].n, 1);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});

test('Fundi completion request atomically records a private OTP and enters the requested state', async () => {
  const { job, customer, fundi } = await createCompletionFixture({ status: 'in_progress' });
  const res = responseRecorder();
  await completeJob({
    params: { id: job.id },
    body: { finalPrice: 1000 },
    user: { id: fundi.id, role: 'fundi' },
  }, res);

  assert.equal(res.payload.success, true);
  assert.equal(res.payload.job.status, 'completion_requested');
  const stored = (await query('select status, completion_otp_hash from jobs where id = $1', [job.id])).rows[0];
  assert.equal(stored.status, 'completion_requested');
  assert.ok(stored.completion_otp_hash);
  const notice = (await query(
    `select data from notifications where user_id = $1 and type = 'job_completion_otp'
      and data->>'jobId' = $2 order by created_at desc limit 1`,
    [customer.id, job.id],
  )).rows[0];
  assert.match(notice.data.otp, /^\d{6}$/);
  const completed = await confirm({ jobId: job.id, customerId: customer.id, otp: notice.data.otp });
  assert.equal(completed.statusCode, 202);
  assert.equal(completed.payload.job.status, 'payment_pending');
  assert.equal((await query(
    `select count(*)::int as n from job_queue where queue_name = 'settlement_release' and payload->>'jobId' = $1`,
    [job.id],
  )).rows[0].n, 1);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});

test('OTP confirmation is one-time and stays payment-pending when no provider-confirmed escrow exists', async () => {
  const { job, customer, otp } = await createCompletionFixture();

  const first = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(first.statusCode, 202);
  assert.equal(first.payload.success, true);
  assert.equal(first.payload.paymentFinalized, false);
  assert.equal(first.payload.paymentPending, true);
  assert.equal(first.payload.job.status, 'payment_pending');

  const stored = (await query(
    'select status, payment_status, customer_completion_confirmed, completion_otp_hash, escrow_status from jobs where id = $1',
    [job.id],
  )).rows[0];
  assert.equal(stored.status, 'payment_pending');
  assert.equal(stored.payment_status, 'customer_confirmed');
  assert.equal(stored.customer_completion_confirmed, true);
  assert.equal(stored.completion_otp_hash, null);
  assert.equal(stored.escrow_status, 'completion_requested');

  const retry = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(retry.payload.alreadyConfirmed, true);
  assert.equal(retry.payload.paymentPending, true);
  assert.equal((await query('select count(*)::int as n from job_timeline where job_id = $1 and event_type = $2', [job.id, 'customer_confirmed'])).rows[0].n, 1);
  const queued = (await query(
    `select status, idempotency_key from job_queue where queue_name = 'settlement_release' and payload->>'jobId' = $1`,
    [job.id],
  )).rows;
  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, 'pending');
  assert.equal(queued[0].idempotency_key, `settlement_release:${job.id}:completion`);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});

test('provider-confirmed held escrow settles once, completes the job, and leaves payout explicitly processing', async () => {
  const { job, customer, fundi, otp } = await createCompletionFixture({ heldPayment: true });

  const result = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.success, true);
  assert.equal(result.payload.paymentFinalized, true);
  assert.equal(result.payload.paymentPending, false);

  const stored = (await query(
    'select status, payment_status, customer_completion_confirmed, completion_otp_hash, escrow_status from jobs where id = $1',
    [job.id],
  )).rows[0];
  assert.equal(stored.status, 'completed');
  assert.equal(stored.payment_status, 'payout_processing');
  assert.equal(stored.customer_completion_confirmed, true);
  assert.equal(stored.completion_otp_hash, null);
  assert.equal(stored.escrow_status, 'released');

  const payment = (await query('select status, escrow_status from payments where job_id = $1', [job.id])).rows[0];
  assert.deepEqual(payment, { status: 'completed', escrow_status: 'released' });
  const payout = (await query('select status from payouts where job_id = $1', [job.id])).rows[0];
  assert.equal(payout.status, 'processing');
  assert.notEqual(payout.status, 'completed');
  const releaseCount = (await query("select count(*)::int as n from escrow_transactions where job_id = $1 and type = 'release'", [job.id])).rows[0].n;
  assert.equal(releaseCount, 1);

  const retries = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(retries.payload.alreadyConfirmed, true);
  assert.equal((await query("select count(*)::int as n from escrow_transactions where job_id = $1 and type = 'release'", [job.id])).rows[0].n, 1);
  assert.ok(fundi.id);
});

test('a verified payment arriving after OTP confirmation resumes settlement from payment-pending', async () => {
  const { job, customer, fundi, otp } = await createCompletionFixture();
  const confirmed = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(confirmed.payload.job.status, 'payment_pending');

  const { enqueueSettlementRelease, releaseJobEscrow } = await import('./services/settlementService.js');
  const paymentId = await transaction(async (client) => {
    const payment = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, commission_rate)
       values ($1, $2, 1000, 'KES', 'completed', 'held', $3, 0.10)
       returning id`,
      [job.id, customer.id, `completion-retry-${crypto.randomUUID()}`],
    );
    await client.query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       values ($1, $2, 'hold', 1000, 'held')`,
      [job.id, payment.rows[0].id],
    );
    await client.query(
      `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
       values ($1, $2, $3, 1000, 'escrow_held')`,
      [job.id, customer.id, fundi.id],
    );
    await client.query(`update jobs set payment_status = 'escrow_held', escrow_status = 'held' where id = $1`, [job.id]);
    await enqueueSettlementRelease(client, { jobId: job.id, paymentId: payment.rows[0].id, source: 'verified_payment_webhook' });
    return payment.rows[0].id;
  });
  assert.equal((await query('select count(*)::int as n from job_queue where idempotency_key = $1', [
    `settlement_release:${job.id}:payment:${paymentId}`,
  ])).rows[0].n, 1);
  const released = await releaseJobEscrow({ jobId: job.id, actorRole: 'system', source: 'verified_payment_webhook' });
  assert.equal(released.released, true);
  assert.equal((await query('select status, escrow_status from jobs where id = $1', [job.id])).rows[0].status, 'completed');
  assert.equal((await query('select status from payouts where job_id = $1', [job.id])).rows[0].status, 'processing');
});

test('a late verified payment queues settlement for a legacy completed job', async () => {
  const { job, customer, fundi, otp } = await createCompletionFixture({ status: 'completed' });
  const confirmed = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(confirmed.payload.job.status, 'completed');
  assert.equal(confirmed.payload.paymentPending, true);

  const { enqueueSettlementRelease, releaseJobEscrow } = await import('./services/settlementService.js');
  const paymentId = await transaction(async (client) => {
    const payment = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, commission_rate)
       values ($1, $2, 1000, 'KES', 'completed', 'held', $3, 0.10) returning id`,
      [job.id, customer.id, `legacy-completion-${crypto.randomUUID()}`],
    );
    await client.query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       values ($1, $2, 'hold', 1000, 'held')`,
      [job.id, payment.rows[0].id],
    );
    await client.query(
      `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
       values ($1, $2, $3, 1000, 'escrow_held')`,
      [job.id, customer.id, fundi.id],
    );
    await client.query(`update jobs set payment_status = 'escrow_held', escrow_status = 'held' where id = $1`, [job.id]);
    await enqueueSettlementRelease(client, { jobId: job.id, paymentId: payment.rows[0].id, source: 'verified_payment_webhook' });
    return payment.rows[0].id;
  });

  const release = await releaseJobEscrow({ jobId: job.id, actorRole: 'system', source: 'verified_payment_webhook' });
  assert.equal(release.released, true);
  const stored = (await query('select status, customer_completion_confirmed, escrow_status from jobs where id = $1', [job.id])).rows[0];
  assert.deepEqual(stored, { status: 'completed', customer_completion_confirmed: true, escrow_status: 'released' });
  assert.equal((await query('select count(*)::int as n from job_queue where idempotency_key = $1', [
    `settlement_release:${job.id}:payment:${paymentId}`,
  ])).rows[0].n, 1);
});

test('a second provider-confirmed charge is quarantined without reopening released escrow', async () => {
  const { job, customer } = await createCompletionFixture({ status: 'completed' });
  const ids = await transaction(async (client) => {
    const first = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, mpesa_receipt_number)
       values ($1, $2, 1000, 'KES', 'completed', 'released', $3, $4) returning id`,
      [job.id, customer.id, `settled-charge-${crypto.randomUUID()}`, `RECEIPT-${crypto.randomUUID()}`],
    );
    const second = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, checkout_request_id)
       values ($1, $2, 1000, 'KES', 'pending', 'pending', $3, $4) returning *`,
      [job.id, customer.id, `duplicate-charge-${crypto.randomUUID()}`, `CHECKOUT-${crypto.randomUUID()}`],
    );
    await client.query(
      `update jobs set status = 'completed', customer_completion_confirmed = true,
         payment_status = 'payout_processing', escrow_status = 'released' where id = $1`,
      [job.id],
    );
    const recorded = await recordUnexpectedSuccessfulPayment(client, {
      payment: second.rows[0],
      receipt: `RECEIPT-${crypto.randomUUID()}`,
      providerAmount: 1000,
      providerResponse: { ResultCode: 0, Amount: 1000 },
      checkoutRequestId: second.rows[0].checkout_request_id,
      rawBody: 'verified-duplicate-callback',
    });
    return { firstId: first.rows[0].id, secondId: second.rows[0].id, recorded };
  });

  assert.equal(ids.recorded.status, 'reconciliation_required');
  assert.equal(Number(ids.recorded.provider_amount), 1000);
  assert.equal(ids.recorded.escrow_status, 'pending');
  const jobState = (await query('select payment_status, escrow_status from jobs where id = $1', [job.id])).rows[0];
  assert.deepEqual(jobState, { payment_status: 'payout_processing', escrow_status: 'released' });
  const paymentStates = (await query('select id, status, escrow_status from payments where id = any($1)', [[ids.firstId, ids.secondId]])).rows;
  assert.equal(paymentStates.find((p) => p.id === ids.firstId).escrow_status, 'released');
  assert.deepEqual(paymentStates.find((p) => p.id === ids.secondId), {
    id: ids.secondId, status: 'reconciliation_required', escrow_status: 'pending',
  });
  assert.equal((await query('select count(*)::int as n from revenue_ledger where payment_id = $1', [ids.secondId])).rows[0].n, 0);
  assert.equal((await query('select count(*)::int as n from accounting_ledger where source_id = $1', [ids.secondId])).rows[0].n, 0);
  assert.equal((await query(
    `select count(*)::int as n from notifications where user_id = $1
       and type = 'payment_reconciliation_required' and data->>'paymentId' = $2`,
    [customer.id, ids.secondId],
  )).rows[0].n, 1);
  assert.equal((await query(
    `select count(*)::int as n from audit_logs where action = 'payment.reconciliation_required' and entity_id = $1`,
    [ids.secondId],
  )).rows[0].n, 1);
});

test('a provider-confirmed amount mismatch is recorded for review without funding escrow', async () => {
  const { job, customer } = await createCompletionFixture({ status: 'payment_pending' });
  const payment = (await query(
    `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
       idempotency_key, checkout_request_id)
     values ($1, $2, 1000, 'KES', 'pending', 'pending', $3, $4) returning *`,
    [job.id, customer.id, `mismatched-charge-${crypto.randomUUID()}`, `CHECKOUT-${crypto.randomUUID()}`],
  )).rows[0];

  const recorded = await transaction((client) => recordUnexpectedSuccessfulPayment(client, {
    payment,
    receipt: `RECEIPT-${crypto.randomUUID()}`,
    providerAmount: 1500,
    reason: 'provider_amount_mismatch',
    force: true,
    providerResponse: { ResultCode: 0, Amount: 1500 },
    checkoutRequestId: payment.checkout_request_id,
    rawBody: 'verified-mismatched-callback',
  }));

  assert.equal(recorded.status, 'reconciliation_required');
  assert.equal(Number(recorded.provider_amount), 1500);
  assert.equal((await query('select payment_status, escrow_status from jobs where id = $1', [job.id])).rows[0].escrow_status, 'none');
  assert.equal((await query('select count(*)::int as n from escrow_transactions where payment_id = $1', [payment.id])).rows[0].n, 0);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});

test('settlement refuses ambiguous held payments and releases only the specified payment', async () => {
  const { job, customer, fundi, otp } = await createCompletionFixture();
  const confirmed = await confirm({ jobId: job.id, customerId: customer.id, otp });
  assert.equal(confirmed.payload.job.status, 'payment_pending');

  const ids = await transaction(async (client) => {
    const first = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, commission_rate)
       values ($1, $2, 1000, 'KES', 'completed', 'held', $3, 0.10) returning id`,
      [job.id, customer.id, `specific-settlement-${crypto.randomUUID()}`],
    );
    const second = await client.query(
      `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
         idempotency_key, commission_rate)
       values ($1, $2, 1000, 'KES', 'completed', 'held', $3, 0.10) returning id`,
      [job.id, customer.id, `ambiguous-settlement-${crypto.randomUUID()}`],
    );
    for (const paymentId of [first.rows[0].id, second.rows[0].id]) {
      await client.query(
        `insert into escrow_transactions (job_id, payment_id, type, amount, status)
         values ($1, $2, 'hold', 1000, 'held')`,
        [job.id, paymentId],
      );
    }
    await client.query(
      `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
       values ($1, $2, $3, 2000, 'escrow_held')`,
      [job.id, customer.id, fundi.id],
    );
    await client.query(`update jobs set payment_status = 'escrow_held', escrow_status = 'held' where id = $1`, [job.id]);
    return { firstId: first.rows[0].id, secondId: second.rows[0].id };
  });

  const { releaseJobEscrow } = await import('./services/settlementService.js');
  const walletBefore = Number((await query('select available_balance from fundi_wallets where fundi_id = $1', [fundi.id])).rows[0]?.available_balance || 0);
  await assert.rejects(
    releaseJobEscrow({ jobId: job.id, actorRole: 'system' }),
    /Multiple held payments require finance reconciliation/,
  );
  const result = await releaseJobEscrow({ jobId: job.id, paymentId: ids.firstId, actorRole: 'system' });
  assert.equal(result.released, true);
  const statuses = (await query('select id, escrow_status from payments where id = any($1)', [[ids.firstId, ids.secondId]])).rows;
  assert.equal(statuses.find((p) => p.id === ids.firstId).escrow_status, 'released');
  assert.equal(statuses.find((p) => p.id === ids.secondId).escrow_status, 'held');
  assert.equal((await query('select count(*)::int as n from wallet_transactions where job_id = $1', [job.id])).rows[0].n, 1);
  assert.equal(Number((await query('select available_balance from fundi_wallets where fundi_id = $1', [fundi.id])).rows[0].available_balance), walletBefore + 900);
});

test('stale queue leases are requeued within the retry budget and failed at the limit', async () => {
  const pendingAttempt = (await query(
    `insert into job_queue (queue_name, payload, status, attempts, max_attempts, started_at, lease_token)
     values ('settlement_release', '{}'::jsonb, 'running', 1, 3, now() - interval '11 minutes', gen_random_uuid())
     returning id`,
  )).rows[0];
  const exhaustedAttempt = (await query(
    `insert into job_queue (queue_name, payload, status, attempts, max_attempts, started_at, lease_token)
     values ('settlement_release', '{}'::jsonb, 'running', 3, 3, now() - interval '11 minutes', gen_random_uuid())
     returning id`,
  )).rows[0];

  const recovered = await recoverStaleRunningJobs();
  assert.ok(recovered.some((job) => job.id === pendingAttempt.id && job.status === 'pending'));
  assert.ok(recovered.some((job) => job.id === exhaustedAttempt.id && job.status === 'failed'));
  const states = (await query(
    'select id, status, attempts, next_run_at, started_at, lease_token, completed_at from job_queue where id = any($1)',
    [[pendingAttempt.id, exhaustedAttempt.id]],
  )).rows;
  const retry = states.find((job) => job.id === pendingAttempt.id);
  assert.equal(retry.status, 'pending');
  assert.equal(retry.attempts, 1);
  assert.ok(retry.next_run_at);
  assert.equal(retry.started_at, null);
  assert.equal(retry.lease_token, null);
  const failed = states.find((job) => job.id === exhaustedAttempt.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.next_run_at, null);
  assert.ok(failed.completed_at);
  assert.equal(failed.lease_token, null);
});

test('finance reconciliation requires evidence, allows retry only after no-charge confirmation, and cannot erase a confirmed charge', async () => {
  const { job, customer } = await createCompletionFixture({ status: 'payment_pending' });
  const unknown = (await query(
    `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
       idempotency_key, provider_response)
     values ($1, $2, 1000, 'KES', 'reconciliation_required', 'pending', $3, $4::jsonb)
     returning id`,
    [job.id, customer.id, `unknown-payment-${crypto.randomUUID()}`, JSON.stringify({ stage: 'stk_initiation', outcome: 'unknown' })],
  )).rows[0];
  const resolved = responseRecorder();
  await reviewPaymentReconciliation({
    params: { paymentId: unknown.id },
    body: { action: 'confirm_no_charge', evidenceReference: 'DARAJA-CASE-REF-1001', notes: 'Provider query confirms no debit.' },
    user: { id: customer.id, role: 'finance_team' },
  }, resolved);
  assert.equal(resolved.payload.payment.status, 'failed');
  assert.equal((await query('select status from payments where id = $1', [unknown.id])).rows[0].status, 'failed');
  assert.equal((await query(
    `select count(*)::int as n from notifications where user_id = $1 and type = 'payment_review_resolved' and data->>'paymentId' = $2`,
    [customer.id, unknown.id],
  )).rows[0].n, 1);

  const confirmed = (await query(
    `insert into payments (job_id, customer_id, amount, currency, status, escrow_status,
       idempotency_key, provider_response)
     values ($1, $2, 1000, 'KES', 'reconciliation_required', 'pending', $3, $4::jsonb)
     returning id`,
    [job.id, customer.id, `confirmed-payment-${crypto.randomUUID()}`, JSON.stringify({ ResultCode: 0, Amount: 1000 })],
  )).rows[0];
  await assert.rejects(
    reviewPaymentReconciliation({
      params: { paymentId: confirmed.id },
      body: { action: 'confirm_no_charge', evidenceReference: 'DARAJA-CASE-REF-1002' },
      user: { id: customer.id, role: 'finance_team' },
    }, responseRecorder()),
    /provider already reported this charge as successful/,
  );
  const stillReviewable = responseRecorder();
  await reviewPaymentReconciliation({
    params: { paymentId: confirmed.id },
    body: { action: 'record_review', evidenceReference: 'DARAJA-CASE-REF-1002', notes: 'Provider confirmed; manual refund review remains open.' },
    user: { id: customer.id, role: 'finance_team' },
  }, stillReviewable);
  assert.equal(stillReviewable.payload.payment.status, 'reconciliation_required');
  const response = (await query('select provider_response from payments where id = $1', [confirmed.id])).rows[0].provider_response;
  assert.equal(response.reconciliationReviews.length, 1);
  await query(`update jobs set status = 'failed' where id = $1`, [job.id]);
});
