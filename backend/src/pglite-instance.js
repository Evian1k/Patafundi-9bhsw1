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

async function createPgliteInstance(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const instance = new PGlite(dataDir);
  await instance.waitReady;
  return instance;
}

/**
 * PGlite (embedded Postgres) is used as a dev-mode fallback when no real
 * DATABASE_URL is configured. On some platforms — notably Windows with
 * certain Node.js versions — PGlite's WASM runtime can abort during init
 * when using a disk-backed data directory.
 *
 * Strategy:
 *   1. Try disk-backed PGlite (persists across restarts).
 *   2. If that fails with a recoverable error, clear the stale data directory
 *      and retry once so the app can recover from a broken local state.
 *   3. If that still fails, fall back to in-memory PGlite (data is lost on
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
        if (isRecoverableDiskError(diskErr) && fs.existsSync(DATA_DIR)) {
          console.warn(`[PataFundi] PGlite disk mode failed (${diskErr?.message || diskErr}); clearing stale data directory and retrying...`);
          try {
            fs.rmSync(DATA_DIR, { recursive: true, force: true });
            fs.mkdirSync(DATA_DIR, { recursive: true });
            pglite = await createPgliteInstance(DATA_DIR);
            console.log(`[PataFundi] Using embedded PostgreSQL (PGlite) at ${DATA_DIR}`);
            return pglite;
          } catch (recoveryErr) {
            console.warn(`[PataFundi] PGlite recovery attempt failed (${recoveryErr?.message || recoveryErr}); trying in-memory...`);
          }
        } else {
          console.warn(`[PataFundi] PGlite disk mode failed (${diskErr?.message || diskErr}); trying in-memory...`);
        }
      }

      // Attempt 2: in-memory PGlite (no disk I/O = avoids certain WASM aborts on Windows).
      try {
        pglite = await createPgliteInstance(':memory:');
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
