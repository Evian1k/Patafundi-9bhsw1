import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPANY_CAPABILITIES,
  COMPANY_ROLE_CAPABILITIES,
  effectiveCapabilities,
  hasCapability,
  requireCompanyMember,
} from './middleware/companyAccess.js';
import { companyAvailableBalance } from './services/companyPayoutService.js';

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
  const middleware = requireCompanyMember({ companyId: 'c1', capability: 'view_finance' });
  const req = fakeReq({ id: 'u1', role: 'customer' });
  req.params.companyId = 'c1';
  const errs = [];
  await middleware(req, {}, (e) => errs.push(e));
  assert.equal(errs[0]?.status || 403, 403, 'forbidden for non-member');
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
