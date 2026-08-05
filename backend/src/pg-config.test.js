import assert from 'node:assert/strict';
import test from 'node:test';
import { getPgPoolConfig, isLocalDatabaseUrl } from './pg-config.js';

function withNodeEnv(value, fn) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test('isLocalDatabaseUrl detects localhost and loopback hosts', () => {
  assert.equal(isLocalDatabaseUrl('postgres://user:pw@localhost:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgres://user:pw@127.0.0.1:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgres://user:pw@LOCALHOST:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgres://user:pw@db.neon.tech/db'), false);
  assert.equal(isLocalDatabaseUrl(''), false);
  assert.equal(isLocalDatabaseUrl(undefined), false);
});

test('getPgPoolConfig returns only the overrides without a connection string', () => {
  assert.deepEqual(getPgPoolConfig('', { max: 3 }), { max: 3 });
  assert.deepEqual(getPgPoolConfig(undefined), {});
});

test('getPgPoolConfig applies the default pool tuning', () => {
  const config = getPgPoolConfig('postgres://user:pw@localhost:5432/db');
  assert.equal(config.connectionString, 'postgres://user:pw@localhost:5432/db');
  assert.equal(config.connectionTimeoutMillis, 30_000);
  assert.equal(config.max, 10);
  assert.equal(config.idleTimeoutMillis, 30_000);
  assert.equal(config.statement_timeout, 15_000);
});

test('getPgPoolConfig never enables ssl for local databases', () => {
  withNodeEnv('production', () => {
    assert.equal(getPgPoolConfig('postgres://user:pw@localhost:5432/db').ssl, undefined);
    assert.equal(getPgPoolConfig('postgres://user:pw@127.0.0.1:5432/db').ssl, undefined);
  });
});

test('getPgPoolConfig enables ssl for known hosted providers in any environment', () => {
  withNodeEnv('development', () => {
    for (const url of [
      'postgres://user:pw@db.render.com/db',
      'postgres://user:pw@db.eu-west-1.rds.amazonaws.com/db',
      'postgres://user:pw@db.supabase.co/db',
      'postgres://user:pw@ep-1.neon.tech/db',
      'postgres://user:pw@example.internal/db?sslmode=require',
    ]) {
      assert.deepEqual(getPgPoolConfig(url).ssl, { rejectUnauthorized: false }, url);
    }
  });
});

test('getPgPoolConfig enables ssl for any remote host in production', () => {
  const url = 'postgres://user:pw@db.example.com/db';
  withNodeEnv('development', () => {
    assert.equal(getPgPoolConfig(url).ssl, undefined);
  });
  withNodeEnv('production', () => {
    assert.deepEqual(getPgPoolConfig(url).ssl, { rejectUnauthorized: false });
  });
});

test('getPgPoolConfig lets overrides win over the defaults', () => {
  const config = getPgPoolConfig('postgres://user:pw@localhost:5432/db', { max: 2, statement_timeout: 1000 });
  assert.equal(config.max, 2);
  assert.equal(config.statement_timeout, 1000);
});
