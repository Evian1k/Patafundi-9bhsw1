import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasPermission,
  isStaffRole,
  requireAllPermissions,
  requireAnyPermission,
  requirePermission,
  requireStaff,
} from './rbac.js';

function capture() {
  const calls = [];
  return { next: (err) => calls.push(err), calls };
}

test('isStaffRole recognises staff roles and rejects the rest', () => {
  for (const role of [
    'super_admin', 'admin', 'support_agent', 'fraud_analyst',
    'finance_team', 'dispatch_team', 'devops_engineer', 'auditor',
  ]) {
    assert.equal(isStaffRole(role), true, role);
  }
  for (const role of ['customer', 'fundi', 'fundi_pending', 'unknown', undefined]) {
    assert.equal(isStaffRole(role), false, String(role));
  }
});

test('requireStaff calls next without an error for staff users', () => {
  const { next, calls } = capture();
  requireStaff()({ user: { role: 'finance_team' } }, {}, next);
  assert.deepEqual(calls, [undefined]);
});

test('requireStaff forwards a 403 for non-staff and anonymous requests', () => {
  for (const req of [{}, { user: { role: 'customer' } }, { user: { role: 'fundi' } }]) {
    const { next, calls } = capture();
    requireStaff()(req, {}, next);
    assert.equal(calls[0].status, 403);
    assert.equal(calls[0].message, 'Staff access required');
  }
});

test('hasPermission returns false without an authenticated user', async () => {
  assert.equal(await hasPermission({}, 'can_view_payments'), false);
});

test('hasPermission grants everything to super_admin without touching the database', async () => {
  const req = { user: { id: 'u1', role: 'super_admin' } };
  assert.equal(await hasPermission(req, 'can_approve_fundis'), true);
  assert.equal(await hasPermission(req, 'any_future_permission'), true);
});

test('requirePermission lets super_admin through', async () => {
  const { next, calls } = capture();
  await requirePermission('can_approve_fundis')({ user: { id: 'u1', role: 'super_admin' } }, {}, next);
  assert.deepEqual(calls, [undefined]);
});

test('requirePermission forwards a 403 when there is no user', async () => {
  const { next, calls } = capture();
  await requirePermission('can_approve_fundis')({}, {}, next);
  assert.equal(calls[0].status, 403);
  assert.match(calls[0].message, /can_approve_fundis/);
});

test('requireAnyPermission passes for super_admin and denies anonymous requests', async () => {
  const allowed = capture();
  await requireAnyPermission('can_view_payments', 'can_view_commissions')(
    { user: { id: 'u1', role: 'super_admin' } }, {}, allowed.next,
  );
  assert.deepEqual(allowed.calls, [undefined]);

  const denied = capture();
  await requireAnyPermission('can_view_payments', 'can_view_commissions')({}, {}, denied.next);
  assert.equal(denied.calls[0].status, 403);
  assert.match(denied.calls[0].message, /can_view_payments, can_view_commissions/);
});

test('requireAllPermissions passes for super_admin and denies anonymous requests', async () => {
  const allowed = capture();
  await requireAllPermissions('can_view_fundis', 'can_approve_fundis')(
    { user: { id: 'u1', role: 'super_admin' } }, {}, allowed.next,
  );
  assert.deepEqual(allowed.calls, [undefined]);

  const denied = capture();
  await requireAllPermissions('can_view_fundis', 'can_approve_fundis')({}, {}, denied.next);
  assert.equal(denied.calls[0].status, 403);
  assert.match(denied.calls[0].message, /can_view_fundis/);
});
