import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureOwnerAccount,
  maybeBootstrapOwnerFromEnv,
  OWNER_EMAIL,
  MIN_OWNER_PASSWORD_LENGTH,
} from './ownerBootstrap.js';

const STRONG = 'neemajoy12kQ';

/**
 * Minimal pool double: supports the three queries ownerBootstrap issues
 * (select existing user, insert user, insert trust score / update role).
 */
function fakePool(existingUser = null) {
  const calls = [];
  const api = {
    calls,
    async query(sql, params) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: norm, params });
      if (/^select id, role from users/i.test(norm)) {
        return { rows: existingUser ? [{ id: 'existing-1', role: existingUser.role }] : [] };
      }
      if (/^insert into users/i.test(norm)) {
        return { rows: [{ id: 'new-1' }] };
      }
      return { rows: [] };
    },
  };
  return api;
}

const silent = { log: () => {}, warn: () => {} };

test('creates the owner account when it does not exist', async () => {
  const pool = fakePool(null);
  const result = await ensureOwnerAccount(pool, { password: STRONG, log: silent.log });

  assert.equal(result.created, true);
  const insert = pool.calls.find((c) => /^insert into users/i.test(c.sql));
  assert.ok(insert, 'users insert executed');
  assert.equal(insert.params[0], OWNER_EMAIL);
  assert.notEqual(insert.params[1], STRONG, 'password stored as bcrypt hash, never plaintext');
  assert.ok(insert.params[1].startsWith('$2'), 'hash is a bcrypt string');
  const trust = pool.calls.find((c) => /^insert into trust_scores/i.test(c.sql));
  assert.ok(trust, 'trust score seeded');
});

test('never overwrites the password of an existing owner', async () => {
  const pool = fakePool({ role: 'super_admin' });
  const result = await ensureOwnerAccount(pool, { password: STRONG, log: silent.log });

  assert.equal(result.created, false);
  assert.equal(result.healed, false);
  assert.equal(result.existingRole, 'super_admin');
  assert.ok(!pool.calls.some((c) => /^insert into users/i.test(c.sql)), 'no user insert');
  assert.ok(!pool.calls.some((c) => /^update users/i.test(c.sql)), 'no role update');
});

test('heals a drifted role back to super_admin without touching the password', async () => {
  const pool = fakePool({ role: 'admin' });
  const result = await ensureOwnerAccount(pool, { password: STRONG, log: silent.log });

  assert.equal(result.created, false);
  assert.equal(result.healed, true);
  const update = pool.calls.find((c) => /^update users/i.test(c.sql));
  assert.ok(update, 'role update executed');
});

test('rejects passwords below the minimum length', async () => {
  const pool = fakePool(null);
  await assert.rejects(
    () => ensureOwnerAccount(pool, { password: 'short', log: silent.log }),
    new RegExp(`at least ${MIN_OWNER_PASSWORD_LENGTH} characters`),
  );
  await assert.rejects(
    () => ensureOwnerAccount(pool, { password: '', log: silent.log }),
    /password is required/,
  );
});

test('maybeBootstrapOwnerFromEnv skips when OWNER_PASSWORD is unset', async () => {
  const saved = process.env.OWNER_PASSWORD;
  delete process.env.OWNER_PASSWORD;
  try {
    const pool = fakePool(null);
    const result = await maybeBootstrapOwnerFromEnv(pool, silent);
    assert.deepEqual(result, { skipped: true, reason: 'OWNER_PASSWORD not set' });
    assert.equal(pool.calls.length, 0, 'no queries issued');
  } finally {
    if (saved === undefined) delete process.env.OWNER_PASSWORD;
    else process.env.OWNER_PASSWORD = saved;
  }
});

test('maybeBootstrapOwnerFromEnv creates the owner when OWNER_PASSWORD is set', async () => {
  const saved = process.env.OWNER_PASSWORD;
  process.env.OWNER_PASSWORD = STRONG;
  try {
    const pool = fakePool(null);
    const result = await maybeBootstrapOwnerFromEnv(pool, silent);
    assert.equal(result.skipped, false);
    assert.equal(result.created, true);
  } finally {
    if (saved === undefined) delete process.env.OWNER_PASSWORD;
    else process.env.OWNER_PASSWORD = saved;
  }
});

test('maybeBootstrapOwnerFromEnv swallows errors so DB boot never fails on it', async () => {
  const saved = process.env.OWNER_PASSWORD;
  process.env.OWNER_PASSWORD = STRONG;
  try {
    const pool = {
      async query() {
        throw new Error('connection refused');
      },
    };
    const result = await maybeBootstrapOwnerFromEnv(pool, silent);
    assert.equal(result.skipped, false);
    assert.match(result.error, /connection refused/);
  } finally {
    if (saved === undefined) delete process.env.OWNER_PASSWORD;
    else process.env.OWNER_PASSWORD = saved;
  }
});
