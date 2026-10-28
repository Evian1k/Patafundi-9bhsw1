import assert from 'node:assert/strict';
import test from 'node:test';
import { query } from './db.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { closeEmbeddedDb } from './pglite-instance.js';
import {
  COMPANY_CAPABILITIES,
  COMPANY_ROLE_CAPABILITIES,
  effectiveCapabilities,
  hasCapability,
  requireCompanyMember,
} from './middleware/companyAccess.js';
import { companyAvailableBalance } from './services/companyPayoutService.js';

test.before(async () => {
  await ensureDevDatabase();
});

test.after(async () => {
  await closeEmbeddedDb();
});

// ── Capability matrix (spec §8 TEAM per-permission matrix) ──
test('owner holds every company capability', () => {
  assert.deepEqual(effectiveCapabilities({ role: 'owner', permissions: null }), COMPANY_CAPABILITIES);
});

test('role defaults mirror the historical role gates', () => {
  assert.deepEqual(effectiveCapabilities({ role: 'finance' }), ['view_overview', 'view_finance', 'request_payout']);
  assert.ok(hasCapability({ role: 'dispatcher' }, 'dispatch_jobs'));
  assert.ok(!hasCapability({ role: 'dispatcher' }, 'view_finance'));
  assert.ok(!hasCapability({ role: 'technician' }, 'manage_team'));
  assert.ok(hasCapability({ role: 'manager' }, 'manage_services'));
});

test('explicit permission overrides win over role defaults and filter unknown keys', () => {
  const member = { role: 'technician', permissions: ['view_finance', 'dispatch_jobs', 'not_a_real_key'] };
  assert.deepEqual(effectiveCapabilities(member), ['view_finance', 'dispatch_jobs']);
  assert.ok(hasCapability(member, 'view_finance'));
  assert.ok(!hasCapability(member, 'handle_jobs'), 'override list replaces defaults entirely');
});

test('empty permission arrays fall back to role defaults', () => {
  assert.deepEqual(effectiveCapabilities({ role: 'finance', permissions: [] }), COMPANY_ROLE_CAPABILITIES.finance);
  assert.deepEqual(effectiveCapabilities(null), []);
});

// ── requireCompanyMember capability gate ──
function fakeReq(user, body = {}) {
  return { user, params: {}, body, query: {} };
}

test('requireCompanyMember rejects members without the required capability', async () => {
  const middleware = requireCompanyMember({ capability: 'view_finance' });
  const customer = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const owner = (await query('select id from users where email = $1', ['admin@patafundi.com'])).rows[0];
  const company = (await query(
    `insert into company_profiles
      (owner_user_id, company_name, legal_name, contact_name, contact_email, contact_phone)
     values ($1, 'Access Test', 'Access Test Ltd', 'Test Owner', 'access@test.local', '254700000000')
     returning id`,
    [owner.id],
  )).rows[0];

  try {
    const req = fakeReq({ id: customer.id, role: 'customer' });
    req.params.companyId = company.id;
    const errs = [];
    await middleware(req, {}, (e) => errs.push(e));
    assert.equal(errs[0]?.status, 403, 'forbidden for non-member');
  } finally {
    await query('delete from company_profiles where id = $1', [company.id]);
  }
});

// ── Company payout balance math ──
function fakeClient(pendingSum, activePayoutSum) {
  const api = {
    async query(sql) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (/select\s+id from company_profiles/i.test(norm)) return { rows: [{ id: 'c1' }] };
      if (/available/i.test(norm)) {
        return { rows: [{ available: String(pendingSum - activePayoutSum) }] };
      }
      return { rows: [] };
    },
  };
  return api;
}

test('available balance subtracts outstanding payout requests from pending settlements', async () => {
  const client = fakeClient(10000, 2500);
  assert.equal(await companyAvailableBalance(client, 'c1'), 7500);
});

test('available balance is zero when everything is paid out', async () => {
  const client = fakeClient(500, 500);
  assert.equal(await companyAvailableBalance(client, 'c1'), 0);
});
