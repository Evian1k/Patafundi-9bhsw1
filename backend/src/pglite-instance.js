import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PATAFUNDI_PGDATA_DIR
  ? path.resolve(process.env.PATAFUNDI_PGDATA_DIR)
  : path.join(__dirname, '../../.pgdata');

/** @type {import('@electric-sql/pglite').PGlite | null} */
let pglite = null;
let initPromise = null;
let initError = null;

export function isEmbeddedDb() {
  return Boolean(pglite);
}

function isRecoverableDiskError(error) {
  const msg = String(error?.message || error || '');
  return /aborted|wasm|corrupt|invalid|eacces|eperm|spawn/i.test(msg);
}

function sanitizeEmbeddedSql(sql) {
  return String(sql || '')
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;?/gi, '')
    .replace(/create\s+extension\s+pgcrypto\s*;?/gi, '')
    .trim();
}

async function createPgliteInstance(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const normalizedDataDir = dataDir === ':memory:' || dataDir === 'memory' ? undefined : dataDir;
  const instance = new PGlite(normalizedDataDir);
  await instance.waitReady;
  const patched = instance;
  const originalExec = patched.exec.bind(patched);
  patched.exec = async (sql, ...rest) => {
    const sanitized = sanitizeEmbeddedSql(sql);
    if (!sanitized) return { rows: [], fields: [], command: 'SKIP', rowCount: 0, affectedRows: 0 };
    return originalExec(sanitized, ...rest);
  };
  return patched;
}

/**
 * PGlite (embedded Postgres) is used as a dev-mode fallback when no real
 * DATABASE_URL is configured. On some platforms — notably Windows with
 * certain Node.js versions — PGlite's WASM runtime can abort during init
 * when using a disk-backed data directory. Each test worker uses an isolated
 * temporary directory; failed disk initialization never deletes stored data.
 *
 * Strategy:
 *   1. Try disk-backed PGlite (persists across restarts).
 *   2. If that fails, fall back to in-memory PGlite (data is lost on
 *      restart, but the app keeps working in dev).
 */
export async function getEmbeddedDb() {
  if (pglite) return pglite;
  if (initError) throw initError;
  if (!initPromise) {
    initPromise = (async () => {
      // Attempt 1: disk-backed PGlite (preferred — data persists across restarts).
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        pglite = await createPgliteInstance(DATA_DIR);
        console.log(`[PataFundi] Using embedded PostgreSQL (PGlite) at ${DATA_DIR}`);
        return pglite;
      } catch (diskErr) {
        const reason = isRecoverableDiskError(diskErr) ? 'disk initialization error' : 'disk mode unavailable';
        console.warn(`[PataFundi] PGlite ${reason} (${diskErr?.message || diskErr}); trying in-memory without modifying ${DATA_DIR}...`);
      }

      // Attempt 2: in-memory PGlite (no disk I/O = avoids certain WASM aborts on Windows).
      try {
        pglite = await createPgliteInstance();
        console.log('[PataFundi] Using embedded PostgreSQL (PGlite) in-memory mode');
        console.log('[PataFundi] ⚠️  Data will be lost on restart. For persistent data, set DATABASE_URL (see .env.example).');
        return pglite;
      } catch (memErr) {
        // Both attempts failed — wrap in a clear, actionable error.
        const isWindows = process.platform === 'win32';
        const hint = isWindows
          ? [
              '',
              '╔══════════════════════════════════════════════════════════════════╗',
              '║  PGlite failed to initialize on Windows. Fix with ONE of:       ║',
              '╠══════════════════════════════════════════════════════════════════╣',
              '║                                                                  ║',
              '║  OPTION A — Free cloud Postgres (FASTEST, 30 seconds):           ║',
              '║    1. Go to https://neon.tech (sign up with GitHub, free)        ║',
              '║    2. Create a project, copy the connection string               ║',
              '║    3. Put in .env:  DATABASE_URL=postgresql://...neon.tech/...   ║',
              '║                                                                  ║',
              '║  OPTION B — Docker Postgres:                                      ║',
              '║    docker compose up -d                                          ║',
              '║    DATABASE_URL=postgres://postgres:postgres@localhost:5432/...   ║',
              '║                                                                  ║',
              '║  OPTION C — Try Node.js 20 LTS:                                   ║',
              '║    nvm install 20 && nvm use 20                                  ║',
              '║                                                                  ║',
              '╚══════════════════════════════════════════════════════════════════╝',
              '',
              `  Original PGlite error: ${memErr?.message || memErr}`,
            ].join('\n')
          : `PGlite failed to initialize: ${memErr?.message || memErr}`;
        initError = new Error(hint);
        initError.status = 503;
        throw initError;
      }
    })();
  }
  return initPromise;
}

export function setEmbeddedDb(instance) {
  pglite = instance;
  initError = null;
  initPromise = null;
}

/** Gracefully close the embedded instance so short-lived scripts (seeds,
 *  probes) can exit without leaving the WASM page cache mid-write. */
export async function closeEmbeddedDb() {
  if (pglite) {
    try {
      await pglite.close();
    } catch {
      // best-effort — the process is exiting anyway
    }
    pglite = null;
    initPromise = null;
  }
}
