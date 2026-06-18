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
 * certain Node.js versions — PGlite's WASM runtime can abort during init.
 *
 * When that happens we DON'T crash the server. Instead we throw a clear
 * error that tells the developer exactly how to fix it (use Docker Postgres
 * or set DATABASE_URL). The server's error handler converts this to a 503
 * on /health so Render's health check fails loudly, rather than the process
 * dying with an opaque WASM abort.
 */
export async function getEmbeddedDb() {
  if (pglite) return pglite;
  if (initError) throw initError;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Ensure the data dir exists and is writable.
        fs.mkdirSync(DATA_DIR, { recursive: true });

        const { PGlite } = await import('@electric-sql/pglite');
        pglite = new PGlite(DATA_DIR);
        await pglite.waitReady;
        console.log(`[PataFundi] Using embedded PostgreSQL (PGlite) at ${DATA_DIR}`);
        return pglite;
      } catch (err) {
        // PGlite WASM aborts are often opaque ("Aborted(). Build with -sASSERTIONS...").
        // Wrap in a clear, actionable error.
        const isWindows = process.platform === 'win32';
        const hint = isWindows
          ? [
              'PGlite failed to initialize on Windows. This is a known issue with PGlite',
              'on some Windows + Node.js combinations. Fix it with ONE of:',
              '',
              '  OPTION 1 — Use Docker Postgres (recommended):',
              '    docker compose up -d',
              '    # then set in .env:',
              '    DATABASE_URL=postgres://postgres:postgres@localhost:5432/patafundi',
              '',
              '  OPTION 2 — Use a local Postgres install:',
              '    # Install Postgres 16+, create a `patafundi` database, then set:',
              '    DATABASE_URL=postgres://postgres:postgres@localhost:5432/patafundi',
              '',
              '  OPTION 3 — Try a different Node.js version (PGlite works best on Node 20 LTS).',
              '    nvm install 20 && nvm use 20',
              '',
              `  Original PGlite error: ${err?.message || err}`,
            ].join('\n')
          : `PGlite failed to initialize: ${err?.message || err}`;
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
