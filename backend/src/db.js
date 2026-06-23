import pg from 'pg';
import { config, requireConfig } from './config.js';
import { getEmbeddedDb, isEmbeddedDb } from './pglite-instance.js';
import { getPgPoolConfig, isLocalDatabaseUrl } from './pg-config.js';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;
let useEmbedded = false;
let initPromise = null;
/** @type {Error | null} */
let lastConnectionError = null;

async function initDriver() {
  if (pool || useEmbedded) return;

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (process.env.PATAFUNDI_EMBEDDED_DB === '1') {
      lastConnectionError = new Error('Embedded database is disabled in production');
      return;
    }
    if (!config.databaseUrl) {
      lastConnectionError = new Error('DATABASE_URL is not configured');
      return;
    }
    if (isLocalDatabaseUrl(config.databaseUrl)) {
      lastConnectionError = new Error('DATABASE_URL must not point to localhost in production');
      return;
    }
    try {
      // Use a longer timeout for the initial connection — Neon free tier
      // suspends idle databases and the first connection can take 10+ seconds
      // to wake up. The default 10s timeout is too short.
      const poolConfig = getPgPoolConfig(config.databaseUrl, {
        connectionTimeoutMillis: 30_000, // 30 seconds for Neon cold start
        max: 10,
        idleTimeoutMillis: 30_000,
        statement_timeout: 15_000, // 15s per query
      });
      pool = new Pool(poolConfig);
      await pool.query('select 1');
      lastConnectionError = null;
      console.log('[PataFundi API] PostgreSQL database ready');
    } catch (error) {
      lastConnectionError = error instanceof Error ? error : new Error(String(error));
      await pool?.end().catch(() => {});
      pool = null;
      console.error('[PataFundi API] PostgreSQL connection failed:', lastConnectionError.message);
      console.error('[PataFundi API] Will retry on next request...');
      // CRITICAL: Do NOT permanently give up. Clear the error so the next
      // request will retry the connection. Neon free tier can have transient
      // connection timeouts during cold starts — the database is fine, we
      // just need to retry.
    }
    return;
  }

  if (process.env.PATAFUNDI_EMBEDDED_DB === '1') {
    useEmbedded = true;
    await getEmbeddedDb();
    return;
  }

  if (config.databaseUrl) {
    const testPool = new Pool(getPgPoolConfig(config.databaseUrl, { connectionTimeoutMillis: 2000 }));
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
  // If we have a connection error and no pool, reset initPromise so we
  // retry the connection on the next request. This is critical for
  // production — Neon free tier can have transient timeouts, and we
  // must not permanently give up after one failure.
  if (lastConnectionError && !pool && !useEmbedded && process.env.NODE_ENV === 'production') {
    initPromise = null; // allow retry
  }
  if (!initPromise) initPromise = initDriver().catch((error) => {
    lastConnectionError = error instanceof Error ? error : new Error(String(error));
  });
  await initPromise;
  if (lastConnectionError && process.env.NODE_ENV === 'production' && !pool && !useEmbedded) {
    throw lastConnectionError;
  }
}

export { pool };

export async function query(sql, params = []) {
  await ensureInit();
  if (useEmbedded || isEmbeddedDb()) {
    const db = await getEmbeddedDb();
    return db.query(sql, params);
  }
  requireConfig(config.databaseUrl, 'DATABASE_URL');
  if (!pool) {
    const error = lastConnectionError || new Error('Database connection is not available');
    error.status = 503;
    throw error;
  }
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
  if (!pool) {
    const error = lastConnectionError || new Error('Database connection is not available');
    error.status = 503;
    throw error;
  }
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
    if (process.env.NODE_ENV === 'production') {
      if (!config.databaseUrl) {
        return { configured: false, ok: false, error: 'DATABASE_URL is not set' };
      }
      if (isLocalDatabaseUrl(config.databaseUrl)) {
        return { configured: true, ok: false, error: 'DATABASE_URL points to localhost' };
      }
      if (lastConnectionError && !pool) {
        return { configured: true, ok: false, error: lastConnectionError.message, mode: 'postgres' };
      }
    }

    await ensureInit();

    if (useEmbedded || isEmbeddedDb()) {
      const db = await getEmbeddedDb();
      const result = await db.query('select 1 as ok');
      return { configured: true, ok: result.rows[0]?.ok === 1, mode: 'embedded' };
    }
    if (!config.databaseUrl) return { configured: false, ok: false };
    if (!pool) {
      return {
        configured: true,
        ok: false,
        error: lastConnectionError?.message || 'Pool not initialized',
        mode: 'postgres',
      };
    }
    const result = await pool.query('select 1 as ok');
    return { configured: true, ok: result.rows[0]?.ok === 1, mode: 'postgres' };
  } catch (error) {
    return {
      configured: Boolean(config.databaseUrl),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
