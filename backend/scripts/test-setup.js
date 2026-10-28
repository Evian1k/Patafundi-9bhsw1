import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.PATAFUNDI_ALLOW_DEMO_SEED = 'true';
process.env.PATAFUNDI_DEMO_SEED_PASSWORD ||= randomBytes(32).toString('base64url');
process.env.OWNER_PASSWORD ||= randomBytes(32).toString('base64url');

if (process.env.PATAFUNDI_TEST_DATABASE_URL) {
  const url = new URL(process.env.PATAFUNDI_TEST_DATABASE_URL);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())
    || !/^patafundi_test(?:_|$)/i.test(databaseName)) {
    throw new Error('PATAFUNDI_TEST_DATABASE_URL must target a loopback PostgreSQL database named patafundi_test or patafundi_test_*');
  }
  process.env.DATABASE_URL = process.env.PATAFUNDI_TEST_DATABASE_URL;
  delete process.env.PATAFUNDI_EMBEDDED_DB;
  delete process.env.PATAFUNDI_PGDATA_DIR;
} else {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patafundi-test-pgdata-'));
  process.env.DATABASE_URL = '';
  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  process.env.PATAFUNDI_PGDATA_DIR = testDataDir;
  process.on('exit', () => {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });
}
