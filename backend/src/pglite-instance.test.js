import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmbeddedDb } from './pglite-instance.js';

test('getEmbeddedDb initializes and answers simple queries', async () => {
  const db = await getEmbeddedDb();
  const result = await db.query('select 1 as ok');
  assert.equal(result.rows[0].ok, 1);
});
