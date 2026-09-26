import assert from 'node:assert/strict';
import test from 'node:test';
import { requireFinancialAccess, sanitizeJobForCustomer, sanitizeJobForFundi } from './financialConfidentialityService.js';

const JOB = {
  id: 'job-1',
  service_category: 'plumbing',
  description: 'Leaking kitchen sink',
  status: 'accepted',
  urgency: 'high',
  customer_address: '12 Ngong Road',
  customer_latitude: -1.3,
  customer_longitude: 36.8,
  customer_name: 'Amina',
  estimated_price: 2000,
  estimated_duration_minutes: 90,
  distance_km: 4.2,
  created_at: '2025-01-01T08:00:00Z',
  accepted_at: '2025-01-01T08:05:00Z',
  platform_price: 2000,
  price_calculation_id: 'calc-1',
  commission_amount: 300,
  commission_percent: 15,
  platform_fee: 50,
  fundi_earnings: 1700,
  final_price: 2000,
};

test('sanitizeJobForCustomer strips every internal financial field', () => {
  const sanitized = sanitizeJobForCustomer(JOB);
  for (const key of [
    'platform_price', 'price_calculation_id', 'commission_amount',
    'commission_percent', 'platform_fee', 'fundi_earnings', 'final_price',
  ]) {
    assert.equal(key in sanitized, false, `${key} should be stripped`);
  }
  assert.equal(sanitized.id, 'job-1');
  assert.equal(sanitized.estimated_price, 2000);
  assert.equal(sanitized.customer_address, '12 Ngong Road');
});

test('sanitizeJobForCustomer passes through null and undefined jobs', () => {
  assert.equal(sanitizeJobForCustomer(null), null);
  assert.equal(sanitizeJobForCustomer(undefined), undefined);
});

test('sanitizeJobForFundi exposes only net earnings and job logistics', () => {
  const sanitized = sanitizeJobForFundi(JOB);
  assert.deepEqual(Object.keys(sanitized).sort(), [
    'acceptedAt', 'createdAt', 'customerAddress', 'customerLatitude', 'customerLongitude',
    'customerName', 'description', 'distanceKm', 'estimatedDurationMinutes', 'id',
    'netEarnings', 'serviceCategory', 'status', 'urgency',
  ]);
  assert.equal(sanitized.netEarnings, 1700);
  assert.equal(sanitized.serviceCategory, 'plumbing');
});

test('sanitizeJobForFundi defaults net earnings to 85% of the estimated price', () => {
  const { fundi_earnings, ...withoutEarnings } = JOB;
  assert.equal(sanitizeJobForFundi(withoutEarnings).netEarnings, 1700);
  assert.equal(sanitizeJobForFundi({ id: 'x', estimatedPrice: 999 }).netEarnings, 849);
  assert.equal(sanitizeJobForFundi({ id: 'x' }).netEarnings, 0);
});

test('sanitizeJobForFundi accepts camelCase field aliases', () => {
  const sanitized = sanitizeJobForFundi({ id: 'x', serviceCategory: 'electrical', estimatedPrice: 1000 });
  assert.equal(sanitized.serviceCategory, 'electrical');
  assert.equal(sanitized.netEarnings, 850);
});

test('sanitizeJobForFundi passes through null jobs', () => {
  assert.equal(sanitizeJobForFundi(null), null);
});

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('requireFinancialAccess returns 401 when the request is unauthenticated', async () => {
  const res = mockRes();
  let nextCalled = false;
  await requireFinancialAccess('view_revenue')({}, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(nextCalled, false);
});
