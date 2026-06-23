/** PostgreSQL pool options for local dev and hosted providers (Render, Supabase, etc.). */
export function getPgPoolConfig(connectionString, overrides = {}) {
  if (!connectionString) return overrides;

  const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString);
  const isProduction = process.env.NODE_ENV === 'production';
  const hosted =
    /render\.com/i.test(connectionString)
    || /amazonaws\.com/i.test(connectionString)
    || /supabase\.co/i.test(connectionString)
    || /neon\.tech/i.test(connectionString)
    || /sslmode=require/i.test(connectionString);

  const useSsl = !isLocal && (isProduction || hosted);

  return {
    connectionString,
    // Neon free tier suspends idle databases — first connection can take
    // 10+ seconds. Use 30s timeout to avoid false failures on cold starts.
    connectionTimeoutMillis: 30_000,
    max: 10,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    ...overrides,
  };
}

export function isLocalDatabaseUrl(connectionString) {
  return Boolean(connectionString && /localhost|127\.0\.0\.1/i.test(connectionString));
}
