// Live verification of the company settlement payout loop (Task 18-b).
// Run `node scripts/patafundi-e2e.mjs` FIRST — its booking flow leaves a
// pending company settlement that this probe withdraws and completes:
// company finance view → payout destination → withdrawal request →
// admin drill-down → admin payout completion → settlements marked paid.
const BASE = 'http://localhost:4000/api';

function jar() {
  return { token: null };
}
async function req(j, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(j.token ? { Authorization: `Bearer ${j.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const assert = (cond, label, extra = '') => {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label} ${extra}`); process.exitCode = 1; }
};

// Apex Home Services owner (from seed-takeover demo accounts)
const owner = jar();
let r = await req(owner, 'POST', '/auth/login', { email: 'company.demo@patafundi.test', password: 'PataFundi#2026' });
assert(r.status === 200, 'company owner login', JSON.stringify(r.json?.message || r.json));
owner.token = r.json?.token;

// (Pending settlement seeded by scripts/seed-pending-settlement.mjs before server start)

r = await req(owner, 'GET', '/company/portal/finance');
assert(r.status === 200, 'finance view (view_finance capability)', JSON.stringify(r.json?.message));
assert(r.json?.summary?.availableForWithdrawal !== undefined, 'availableForWithdrawal present', JSON.stringify(r.json?.summary));
console.log('    raw finance summary:', JSON.stringify(r.json?.summary));
const available = r.json?.summary?.availableForWithdrawal ?? 0;
console.log(`    available: ${available} KES`);

r = await req(owner, 'PUT', '/company/portal/finance/payout-destination', {
  method: 'mpesa', mpesaNumber: '254700111333', accountName: 'Apex Home Services Ltd',
});
assert(r.status === 200, 'payout destination saved', JSON.stringify(r.json));
assert(r.json?.payoutAccount?.mpesaNumber?.includes('••••'), 'destination masked in response', JSON.stringify(r.json?.payoutAccount));

// Withdraw (guard: min payout might block tiny amounts — use full available or 500)
const amount = Math.max(500, Math.floor(available || 4250));
const idemKey = `probe-${Date.now()}`;
r = await req(owner, 'POST', '/company/portal/finance/withdraw', { amount, idempotencyKey: idemKey });
assert(r.status === 201, 'withdrawal request created', JSON.stringify(r.json));
const payoutId = r.json?.payout?.id;
const payoutAmount = Number(r.json?.payout?.amount);

// Idempotency: same key returns the same payout
r = await req(owner, 'POST', '/company/portal/finance/withdraw', { amount, idempotencyKey: idemKey });
assert(r.status === 201 && r.json?.payout?.id === payoutId, 'idempotent withdraw returns same payout', JSON.stringify(r.json));

// Overdraft guard
r = await req(owner, 'POST', '/company/portal/finance/withdraw', { amount: available * 100 + 999999 });
assert(r.status !== 201, 'overdraft rejected', JSON.stringify(r.json));

// Admin drill-down + completion
const admin = jar();
r = await req(admin, 'POST', '/auth/login', { email: 'operations.demo@patafundi.test', password: 'PataFundi#2026' });
assert(r.status === 200, 'admin login');
admin.token = r.json?.token;

r = await req(admin, 'GET', '/admin/companies');
const apex = (r.json?.companies || []).find((c) => c.companyName?.includes('Apex'));
assert(Boolean(apex?.id), 'company list includes Apex');

r = await req(admin, 'GET', `/admin/companies/${apex.id}`);
assert(r.status === 200, 'admin company drill-down', JSON.stringify(r.json?.message || r.json?.error || r.status));
assert(Array.isArray(r.json?.members) && r.json.members.length > 0, 'drill-down includes members');
assert(Array.isArray(r.json?.services), 'drill-down includes services');
assert(Array.isArray(r.json?.jobs), 'drill-down includes jobs');
assert(r.json?.finance?.pending !== undefined, 'drill-down includes finance totals');

r = await req(admin, 'GET', '/admin/payouts?requested');
const found = (r.json?.payouts || []).find((p) => p.id === payoutId);
assert(Boolean(found), 'company payout visible in admin ledger');
assert(found?.provider_type === 'company', 'payout provider_type = company');

r = await req(admin, 'POST', `/admin/payouts/${payoutId}/complete`, { providerReference: `PROBE-${Date.now()}` });
assert(r.status === 200, 'admin completes company payout', JSON.stringify(r.json));

r = await req(owner, 'GET', '/company/portal/finance');
const paidRows = (r.json?.settlements || []).filter((s) => s.status === 'paid');
assert(paidRows.length > 0, 'settlements marked paid after completion', JSON.stringify(r.json?.summary));
assert((r.json?.payoutRequests || []).find((p) => p.id === payoutId)?.status === 'completed', 'payout request shows completed');

// Fundi payouts still visible in the admin ledger (regression guard)
r = await req(admin, 'GET', '/admin/payouts');
assert((r.json?.payouts || []).length > 0, 'admin payouts ledger non-empty');

console.log('\nPayout loop verification complete.');
process.exit(process.exitCode || 0);
