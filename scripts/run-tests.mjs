import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('[tests] Refusing to run tests when NODE_ENV=production.');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const e2eOnly = args.includes('e2e');
const nodeOptions = args.filter((arg) => arg.startsWith('--'));
const invalidArgs = args.filter((arg) => arg !== 'e2e' && !arg.startsWith('--'));
if (invalidArgs.length) {
  console.error(`[tests] Unsupported argument(s): ${invalidArgs.join(', ')}`);
  process.exit(2);
}

function collectTestFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectTestFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      if (!e2eOnly || entry.name.endsWith('.e2e.test.js')) result.push(fullPath);
    }
  }
  return result.sort();
}

const testFiles = collectTestFiles(path.join(repoRoot, 'backend/src'));
if (!testFiles.length) {
  console.error('[tests] No matching backend test files were found.');
  process.exit(1);
}

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patafundi-test-'));
const databaseDir = path.join(scratchRoot, 'postgres');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  PATAFUNDI_TEST_MODE: '1',
  PATAFUNDI_EMBEDDED_DB: '1',
  PATAFUNDI_PGDATA_DIR: databaseDir,
  DATABASE_URL: '',
  MONGO_URI: '',
  OWNER_PASSWORD: '',
  JWT_SECRET: 'patafundi-test-only-jwt-secret-not-for-production',
  REFRESH_TOKEN_SECRET: 'patafundi-test-only-refresh-secret-not-for-production',
};
for (const key of Object.keys(env)) {
  if (/^(MPESA_|STRIPE_|RESEND_|AWS_|R2_|OPENAI_|GOOGLE_)/.test(key)) delete env[key];
}

let exitCode = 1;
try {
  // Ensure any dotenv-based test imports see an empty scratch directory, not a
  // developer's .env. config.js also skips repository .env loading in test mode.
  process.chdir(scratchRoot);
  Object.assign(process.env, env);
  const { ensureDevDatabase } = await import('../backend/scripts/ensure-dev-db.js');
  const ready = await ensureDevDatabase();
  if (!ready) throw new Error('Could not prepare the isolated PGlite test database.');

  const { closeEmbeddedDb } = await import('../backend/src/pglite-instance.js');
  await closeEmbeddedDb();

  console.log(`[tests] Running ${testFiles.length} test file(s) sequentially against a disposable PGlite database.`);
  const childArgs = [
    '--test',
    '--test-concurrency=1',
    '--test-force-exit',
    ...nodeOptions,
    ...testFiles,
  ];
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, { cwd: scratchRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} catch (error) {
  console.error(`[tests] ${error?.stack || error}`);
  exitCode = 1;
} finally {
  fs.rmSync(scratchRoot, { recursive: true, force: true });
}
process.exit(exitCode);
