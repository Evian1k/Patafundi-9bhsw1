import pg from 'pg';
import { config, requireConfig } from './config.js';
import { getEmbeddedDb, isEmbeddedDb } from './pglite-instance.js';
import { getPgPoolConfig, isLocalDatabaseUrl } from './pg-config.js';
import { logNonFatal, swallow } from './utils/logError.js';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;
let useEmbedded = false;
let initPromise = null;
/** @type {Error | null} */
let lastConnectionError = null;
let consecutiveFailures = 0;

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
      const poolConfig = getPgPoolConfig(config.databaseUrl, {
        connectionTimeoutMillis: 30_000,
        max: 10,
        idleTimeoutMillis: 30_000,
        statement_timeout: 15_000,
      });
      pool = new Pool(poolConfig);
      await pool.query('select 1');
      lastConnectionError = null;
      consecutiveFailures = 0;
      console.log('[PataFundi API] PostgreSQL database ready');
    } catch (error) {
      lastConnectionError = error instanceof Error ? error : new Error(String(error));
      await pool?.end().catch(swallow('db.poolEnd'));
      pool = null;
      consecutiveFailures++;
      console.error(`[PataFundi API] PostgreSQL connection failed (attempt ${consecutiveFailures}):`, lastConnectionError.message);
      console.error('[PataFundi API] Will retry on next request...');
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
    } catch (error) {
      logNonFatal('db.probe', error, { fallback: 'embedded' });
      await testPool.end().catch(swallow('db.poolEnd'));
    }
  }

  useEmbedded = true;
  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  await getEmbeddedDb();
}

async function ensureInit() {
  // If we have a connection error and no pool, reset initPromise so we
  // retry the connection on the next request.
  if (lastConnectionError && !pool && !useEmbedded) {
    initPromise = null; // allow retry
  }
  if (!initPromise) initPromise = initDriver().catch((error) => {
    lastConnectionError = error instanceof Error ? error : new Error(String(error));
  });
  await initPromise;
  if (lastConnectionError && !pool && !useEmbedded) {
    const error = lastConnectionError;
    error.status = 503;
    throw error;
  }
}

/**
 * Destroy the current pool and reset state so the next request
 * creates a fresh pool. Called when a query fails with a connection
 * error (Neon suspended, network issue, etc.).
 */
async function destroyPool() {
  if (pool) {
    await pool.end().catch(swallow('db.poolEnd'));
    pool = null;
  }
  initPromise = null;
  lastConnectionError = new Error('Database connection lost — reconnecting');
}

/**
 * Check if an error is a connection-level error (not a SQL error).
 * These errors mean the pool's connections are dead and we need to
 * destroy the pool and create a new one.
 */
function isConnectionError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('connection refused') ||
    msg.includes('connection ended') ||
    msg.includes('connection reset') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enoent') ||
    msg.includes('socket hung up') ||
    msg.includes('terminated due to connection timeout') ||
    msg.includes('database unavailable') ||
    msg.includes('the server does not support ssl connections') ||
    // Neon-specific: "connection terminated" when Neon suspends
    msg.includes('terminating connection due to connection timeout')
  );
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

  try {
    return await pool.query(sql, params);
  } catch (error) {
    // CRITICAL FIX: If this is a connection-level error (not a SQL error),
    // the pool's connections are dead. Destroy the pool so the next request
    // creates a fresh pool and reconnects. This fixes the issue where Neon
    // suspends the database and the pool holds dead connections forever.
    if (isConnectionError(error)) {
      console.warn('[PataFundi API] Connection error detected, destroying pool for reconnect:', error.message);
      await destroyPool();
      // Set 503 status so the frontend knows it's a temporary DB issue
      error.status = 503;
      error.message = 'Database temporarily unavailable. Retrying...';
    }
    throw error;
  }
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
    // If connection error during transaction, destroy pool
    if (isConnectionError(error)) {
      console.warn('[PataFundi API] Connection error during transaction, destroying pool:', error.message);
      await destroyPool();
      error.status = 503;
    }
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

    try {
      const result = await pool.query('select 1 as ok');
      return { configured: true, ok: result.rows[0]?.ok === 1, mode: 'postgres' };
    } catch (error) {
      // Health check query failed — pool is dead, destroy it
      console.warn('[PataFundi API] Health check query failed, destroying pool:', error.message);
      await destroyPool();
      return {
        configured: true,
        ok: false,
        error: error.message,
        mode: 'postgres',
      };
    }
  } catch (error) {
    return {
      configured: Boolean(config.databaseUrl),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
