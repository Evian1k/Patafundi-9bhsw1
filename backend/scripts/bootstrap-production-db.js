/**
 * Production DB bootstrap — runs migrations before start.
 * Non-fatal: server still starts if DB is temporarily unavailable.
 */
import { bootstrapPostgresDatabase } from './ensure-dev-db.js';
import { isLocalDatabaseUrl } from '../src/pg-config.js';

if (process.env.NODE_ENV !== 'production') {
  console.log('[bootstrap] skipped (not production)');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL || '';
if (!databaseUrl) {
  console.error('[bootstrap] DATABASE_URL is not set — link a Render PostgreSQL database');
  process.exit(0);
}

if (isLocalDatabaseUrl(databaseUrl)) {
  console.error('[bootstrap] DATABASE_URL points to localhost — ignored in production');
  process.exit(0);
}

try {
  const ok = await bootstrapPostgresDatabase({ required: false });
  if (ok) {
    console.log('[bootstrap] production database ready');
  } else {
    console.warn('[bootstrap] database not ready — server will start and retry via /health');
  }
} catch (error) {
  console.error('[bootstrap] failed:', error.message);
  console.warn('[bootstrap] continuing startup — fix DATABASE_URL on Render');
}
