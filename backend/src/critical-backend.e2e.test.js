import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { authRequired, signAccessToken } from './middleware/auth.js';
import { hasPermission } from './middleware/rbac.js';
import { refresh } from './controllers/authController.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { createJob } from './controllers/jobController.js';
import { calculateSurgePricing, findNearbyFundis } from './services/geoMatchingService.js';
import { calculateCommission, calculateWithdrawalFee } from './services/financeService.js';

test.before(async () => {
  await ensureDevDatabase();
});

test('embedded database bootstrap and JWT session flow work', async () => {
  const user = (await query('select id, email, role, status from users where email = $1', ['demo@patafundi.com'])).rows[0];
  assert.ok(user, 'seeded demo customer should exist');

  const token = signAccessToken({ id: user.id, email: user.email, role: user.role });
  const payload = jwt.verify(token, config.jwtSecret, {
    issuer: 'patafundi-api',
    audience: 'patafundi-web',
    algorithms: ['HS256'],
  });

  assert.equal(payload.sub, user.id);
  assert.equal(payload.role, user.role);
  assert.throws(() =>
    jwt.verify(`${token.slice(0, -1)}x`, config.jwtSecret, {
      issuer: 'patafundi-api',
      audience: 'patafundi-web',
      algorithms: ['HS256'],
    }),
  {
    name: 'JsonWebTokenError',
    message: 'invalid signature',
  });

  const req = {
    method: 'GET',
    path: '/api/users/me',
    originalUrl: '/api/users/me',
    cookies: { access_token: token },
    headers: {},
    get: () => null,
  };

  await new Promise((resolve, reject) => {
    authRequired(req, {}, (err) => (err ? reject(err) : resolve()));
  });

  assert.equal(req.user.email, user.email);
  assert.equal(req.user.role, user.role);
});

test('expired refresh JWTs are classified as authentication failures', async () => {
  const refreshToken = jwt.sign(
    { sub: '00000000-0000-4000-8000-000000000001', type: 'refresh' },
    config.refreshSecret || config.jwtSecret,
    { expiresIn: -1, issuer: 'patafundi-api', audience: 'patafundi-web', algorithm: 'HS256' },
  );

  await assert.rejects(
    () => refresh({ cookies: {}, body: { refreshToken } }, { json() {} }),
    (error) => error.status === 403 && error.message === 'Invalid or expired refresh token',
  );
});

test('customer access is denied for protected permissions while super admin remains authorized', async () => {
  const customer = (await query('select id, role from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const admin = (await query('select id, role from users where email = $1', ['admin@patafundi.com'])).rows[0];

  assert.equal(await hasPermission({ user: { id: customer.id, role: customer.role } }, 'can_view_payments'), false);
  assert.equal(await hasPermission({ user: { id: admin.id, role: admin.role } }, 'can_view_payments'), true);
});

test('job creation and matching use the real database-backed workflow', async () => {
  const customer = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const fundi = (await query('select id from users where email = $1', ['fundi@patafundi.com'])).rows[0];

  await query(
    `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, online, latitude, longitude, rating, verification_badge)
     values ($1, $2, $3, $4, 'approved', true, -1.2864, 36.8172, 5.0, true)
     on conflict (user_id) do update set
       skills = excluded.skills,
       approval_status = 'approved',
       online = true,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       rating = excluded.rating,
       verification_badge = true`,
    [fundi.id, ['plumbing', 'electrical'], '5 years experience', '254712000002'],
  );

  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };

  await createJob({
    user: { id: customer.id, role: 'customer' },
    body: {
      serviceCategory: 'plumbing',
      description: 'Burst pipe under the kitchen sink needs urgent repair',
      latitude: -1.2864,
      longitude: 36.8172,
      urgency: 'emergency',
      formattedAddress: 'Nairobi CBD',
    },
    ip: '127.0.0.1',
  }, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.payload.job.id);
  assert.equal(res.payload.job.serviceCategory, 'plumbing');

  const matches = await findNearbyFundis({
    latitude: -1.2864,
    longitude: 36.8172,
    serviceCategory: 'plumbing',
    customerId: customer.id,
  });

  assert.ok(matches.length >= 1);
  assert.equal(matches[0].user_id, fundi.id);

  const jobRow = (await query('select status from jobs where id = $1', [res.payload.job.id])).rows[0];
  assert.equal(jobRow.status, 'matching');
});

test('notifications remain scoped to their users and financial calculations protect payout math', async () => {
  const customer = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const fundi = (await query('select id from users where email = $1', ['fundi@patafundi.com'])).rows[0];

  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_status', 'Your job updated', 'A job is now in progress', $2::jsonb)
     on conflict do nothing`,
    [customer.id, JSON.stringify({ jobId: '00000000-0000-0000-0000-000000000001' })],
  );

  const mine = await query('select * from notifications where user_id = $1 order by created_at desc limit 10', [customer.id]);
  const theirs = await query('select * from notifications where user_id = $1 order by created_at desc limit 10', [fundi.id]);

  assert.ok(mine.rows.some((row) => row.type === 'job_status'));
  assert.ok(!mine.rows.some((row) => row.user_id === fundi.id));
  assert.ok(!theirs.rows.some((row) => row.user_id === customer.id));

  const commission = calculateCommission({
    amount: 10000,
    category: 'plumbing',
    settings: {
      commissionRate: 0.15,
      categoryCommissionRates: { plumbing: 0.10 },
      promotionalDiscounts: { plumbing: 0.05 },
      fixedCommissionKes: 0,
      commissionType: 'percentage',
    },
  });

  assert.equal(commission.platformCommission, 950);
  assert.equal(commission.fundiAmount, 9050);

  const withdrawal = calculateWithdrawalFee(1000, {
    withdrawalFeeType: 'flat',
    withdrawalFeeKes: 50,
  });

  assert.equal(withdrawal.withdrawalFee, 50);
  assert.equal(withdrawal.netAmount, 950);

  const surge = await calculateSurgePricing({
    basePrice: 2000,
    distanceKm: 5,
    isEmergency: true,
    isNight: true,
    fundiId: fundi.id,
  });

  assert.ok(surge.totalPrice > surge.basePrice);
  assert.ok(surge.breakdown.travel >= 0);
  assert.ok(surge.breakdown.emergency > 0);
  assert.ok(surge.breakdown.night > 0);
});
