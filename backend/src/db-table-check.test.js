import assert from 'node:assert/strict';
import test from 'node:test';
import { tableExists } from './db-table-check.js';

test('tableExists returns true when the table is present in public schema', async () => {
  const db = {
    query: async (_sql, params) => ({
      rows: params?.[0] === 'users' ? [{ tablename: 'users' }] : [],
    }),
  };

  assert.equal(await tableExists(db, 'users'), true);
});

test('tableExists returns false when the table is absent', async () => {
  const db = {
    query: async () => ({ rows: [] }),
  };

  assert.equal(await tableExists(db, 'missing_table'), false);
});

test('tableExists rejects table names that are not plain identifiers', async () => {
  const db = { query: async () => { throw new Error('should not query'); } };

  for (const name of ['users; drop table users', '1users', '', 'user-table']) {
    assert.equal(await tableExists(db, name), false, name);
  }
});

test('tableExists falls back to information_schema when pg_tables fails', async () => {
  let attempts = 0;
  const db = {
    query: async (sql) => {
      attempts += 1;
      if (sql.includes('pg_catalog.pg_tables')) throw new Error('permission denied');
      return { rows: [{ table_name: 'users' }] };
    },
  };

  assert.equal(await tableExists(db, 'users'), true);
  assert.equal(attempts, 2);
});
