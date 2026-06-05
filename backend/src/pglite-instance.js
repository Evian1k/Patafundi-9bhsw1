import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PATAFUNDI_PGDATA_DIR
  ? path.resolve(process.env.PATAFUNDI_PGDATA_DIR)
  : path.join(__dirname, '../../.pgdata');

/** @type {import('@electric-sql/pglite').PGlite | null} */
let pglite = null;
let initPromise = null;

export function isEmbeddedDb() {
  return Boolean(pglite);
}

export async function getEmbeddedDb() {
  if (pglite) return pglite;
  if (!initPromise) {
    initPromise = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      pglite = new PGlite(DATA_DIR);
      await pglite.waitReady;
      console.log(`[PataFundi] Using embedded PostgreSQL (PGlite) at ${DATA_DIR}`);
      return pglite;
    })();
  }
  return initPromise;
}

export function setEmbeddedDb(instance) {
  pglite = instance;
}
