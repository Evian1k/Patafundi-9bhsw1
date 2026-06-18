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

/**
 * PGlite (embedded Postgres) is used as a dev-mode fallback when no real
 * DATABASE_URL is configured. On some platforms — notably Windows with
 * certain Node.js versions — PGlite's WASM runtime can abort during init
 * when using a disk-backed data directory.
 *
 * Strategy:
 *   1. Try disk-backed PGlite (persists across restarts).
 *   2. If that fails, try in-memory PGlite (no disk = no WASM abort, but
 *      data is lost on restart — fine for dev/testing).
 *   3. If both fail, throw a clear error telling the developer to use
 *      Docker Postgres or a cloud Postgres (Neon, Supabase, etc.).
 */
export async function getEmbeddedDb() {
  if (pglite) return pglite;
  if (initError) throw initError;
  if (!initPromise) {
    initPromise = (async () => {
      // Attempt 1: disk-backed PGlite (preferred — data persists).
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const { PGlite } = await import('@electric-sql/pglite');
        pglite = new PGlite(DATA_DIR);
        await pglite.waitReady;
        console.log(`[PataFundi] Using embedded PostgreSQL (PGlite) at ${DATA_DIR}`);
        return pglite;
      } catch (diskErr) {
        console.warn(`[PataFundi] PGlite disk mode failed (${diskErr?.message || diskErr}); trying in-memory...`);
      }

      // Attempt 2: in-memory PGlite (no disk I/O = avoids WASM abort on Windows).
      try {
        const { PGlite } = await import('@electric-sql/pglite');
        pglite = new PGlite(); // no path = in-memory mode
        await pglite.waitReady;
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
