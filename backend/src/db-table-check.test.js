import assert from 'node:assert/strict';
import test from 'node:test';
import { tableExists } from './db-table-check.js';

test('tableExists returns true when the table is present in public schema', async () => {
  const db = {
    query: async (sql) => ({
      rows: sql.includes('users') ? [{ tablename: 'users' }] : [],
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
