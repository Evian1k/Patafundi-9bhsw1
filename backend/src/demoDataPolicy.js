const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isSafeDemoSeedDatabase(databaseUrl = '') {
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return false;
    if (!SAFE_LOCAL_HOSTS.has(url.hostname.toLowerCase())) return false;
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return /^patafundi_(dev|test|demo)(?:_|$)/i.test(databaseName);
  } catch {
    return false;
  }
}

export function canSeedDemoData({
  nodeEnv = process.env.NODE_ENV,
  embedded = process.env.PATAFUNDI_EMBEDDED_DB,
  databaseUrl = process.env.DATABASE_URL,
  allowExternalTestSeed = process.env.PATAFUNDI_ALLOW_DEMO_SEED,
} = {}) {
  if (nodeEnv === 'production') return false;
  if (embedded === '1') return true;
  return allowExternalTestSeed === 'true' && isSafeDemoSeedDatabase(databaseUrl);
}

/**
 * Actor-scoped provenance visibility (see userController.notifications for the
 * original pattern). Real users only ever see genuine rows; demo (synthetic)
 * accounts additionally see the isolated demo universe. Demo users can only
 * exist and authenticate outside production, and demo rows can only be seeded
 * into isolated dev/test storage (canSeedDemoData), so this never widens
 * production access.
 *
 * Usage: `... and ($N::boolean or x.is_demo = false)` with
 * `includeDemoFor(req.user)` bound at $N.
 */
export function includeDemoFor(user) {
  return user?.is_demo === true && process.env.NODE_ENV !== 'production';
}

