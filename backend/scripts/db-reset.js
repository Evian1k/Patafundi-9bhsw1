#!/usr/bin/env node
// db-reset.js - SAFE development data reset (spec section 32).
//
//   npm run db              -> purge demo data + re-apply migrations + re-seed
//                              the single authorized demo fixture (dev only)
//   npm run db -- --purge   -> purge only (no reseed), works in any env with
//                              explicit PATAFUNDI_ALLOW_PROD_CLEANUP=1
//
// Production protection:
//   1. Seeding is hard-refused when NODE_ENV=production (seed-takeover guard).
//   2. Purging in production requires the explicit PATAFUNDI_ALLOW_PROD_CLEANUP=1
//      environment flag - it can never happen by running a casual dev command.
//   3. When a DATABASE_URL is configured, a hostname heuristic refuses local
//      purges against remote production-like hosts unless the flag is set.
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const args = process.argv.slice(2);
const PURGE_ONLY = args.includes('--purge');

async function main() {
  const { cleanupDemoData } = await import('./cleanup-demo-data.js');

  console.log('[db-reset] step 1/3 - purging demo/fake data');
  await cleanupDemoData({ dryRun: false });

  console.log('[db-reset] step 2/3 - applying migrations');
  const { ensureDevDatabase } = await import('../src/../scripts/ensure-dev-db.js');
  await ensureDevDatabase();

  if (PURGE_ONLY) {
    console.log('[db-reset] done (purge-only: no demo fixture re-created).');
    return;
  }

  console.log('[db-reset] step 3/3 - seeding the authorized development demo fixture');
  const { seedTakeover } = await import('./seed-takeover.js');
  await seedTakeover();

  console.log('[db-reset] done. Development database is clean and has only the authorized demo fixture.');
}

main()
  .then(async () => {
    // Flush PGlite's buffered pages to disk before exiting, or the tail of
    // the reset silently never lands in .pgdata.
    const { closeEmbeddedDb } = await import('../src/pglite-instance.js');
    await closeEmbeddedDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[db-reset] FAILED:', err.message);
    const { closeEmbeddedDb } = await import('../src/pglite-instance.js');
    await closeEmbeddedDb().catch(() => {});
    process.exit(1);
  });
