import pg from 'pg';
import { config, requireConfig } from './config.js';
import { getEmbeddedDb, isEmbeddedDb } from './pglite-instance.js';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;
let useEmbedded = process.env.PATAFUNDI_EMBEDDED_DB === '1';
let initPromise = null;

async function initDriver() {
  if (pool || useEmbedded) return;

  if (process.env.PATAFUNDI_EMBEDDED_DB === '1') {
    useEmbedded = true;
    await getEmbeddedDb();
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    requireConfig(config.databaseUrl, 'DATABASE_URL');
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
    return;
  }

  if (config.databaseUrl) {
    const testPool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
      ssl: config.databaseUrl?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await testPool.query('select 1');
      pool = testPool;
      return;
    } catch {
      await testPool.end().catch(() => {});
    }
  }

  useEmbedded = true;
  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  await getEmbeddedDb();
}

async function ensureInit() {
  if (!initPromise) initPromise = initDriver();
  await initPromise;
}

export { pool };

export async function query(sql, params = []) {
  await ensureInit();
  if (useEmbedded || isEmbeddedDb()) {
    const db = await getEmbeddedDb();
    return db.query(sql, params);
  }
  requireConfig(config.databaseUrl, 'DATABASE_URL');
  return pool.query(sql, params);
}

export async function transaction(work) {
  await ensureInit();
  if (useEmbedded || isEmbeddedDb()) {
    const db = await getEmbeddedDb();
    await db.query('BEGIN');
    try {
      const client = { query: (s, p) => db.query(s, p) };
      const result = await work(client);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
  requireConfig(config.databaseUrl, 'DATABASE_URL');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function healthcheck() {
  try {
    await ensureInit();
    if (useEmbedded || isEmbeddedDb()) {
      const db = await getEmbeddedDb();
      const result = await db.query('select 1 as ok');
      return { configured: true, ok: result.rows[0]?.ok === 1, mode: 'embedded' };
    }
    if (!config.databaseUrl) return { configured: false, ok: false };
    const result = await pool.query('select 1 as ok');
    return { configured: true, ok: result.rows[0]?.ok === 1, mode: 'postgres' };
  } catch (error) {
    return { configured: Boolean(config.databaseUrl), ok: false, error: error.message };
  }
}
