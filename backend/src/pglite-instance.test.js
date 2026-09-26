import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

// The data directory is resolved at import time — point it at a throwaway
// directory so the test never touches the developer's local .pgdata.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patafundi-pgdata-'));
process.env.PATAFUNDI_PGDATA_DIR = dataDir;

const { getEmbeddedDb, isEmbeddedDb, setEmbeddedDb } = await import('./pglite-instance.js');

// PGlite keeps the event loop alive, so close it or the test runner hangs.
after(async () => {
  const db = await getEmbeddedDb();
  await db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('isEmbeddedDb is false before the embedded database is created', () => {
  assert.equal(isEmbeddedDb(), false);
});

test('getEmbeddedDb initializes and answers simple queries', async () => {
  const db = await getEmbeddedDb();
  const result = await db.query('select 1 as ok');
  assert.equal(result.rows[0].ok, 1);
  assert.equal(isEmbeddedDb(), true);
});

test('getEmbeddedDb returns the same instance on repeated calls', async () => {
  assert.equal(await getEmbeddedDb(), await getEmbeddedDb());
});

test('getEmbeddedDb persists the data directory that was configured', () => {
  assert.equal(fs.existsSync(dataDir), true);
});

test('setEmbeddedDb swaps in an injected instance', async () => {
  const real = await getEmbeddedDb();
  const fake = { query: async () => ({ rows: [{ ok: 2 }] }) };
  try {
    setEmbeddedDb(fake);
    assert.equal(isEmbeddedDb(), true);
    assert.equal(await getEmbeddedDb(), fake);
  } finally {
    setEmbeddedDb(real);
  }
});
