#!/usr/bin/env node
// cleanup-demo-data.js - PataFundi demo/fake data purge (spec sections 30-33).
//
// Removes ALL demo/test data from ANY database (including production):
//   - every *.patafundi.test demo account and everything they own
//     (profiles, properties, jobs, quotes, reviews, payments, notifications,
//     documents, disputes, devices, wallet rows, sessions...)
//   - the "Apex Home Services Ltd" demo company and all of its data
//   - fake notifications / fake analytics rows tied to the demo actors
//
// NEVER touches:
//   - database schema, migrations
//   - service catalog definitions, platform settings, subscription plans
//   - the platform owner account (emmanuelevian@gmail.com)
//   - real customer/fundi/company data
//
// Usage:
//   node backend/scripts/cleanup-demo-data.js            # report + purge
//   node backend/scripts/cleanup-demo-data.js --dry-run  # report only
//
// Safety: refuses to run when NODE_ENV=production unless PATAFUNDI_ALLOW_PROD_CLEANUP=1
// is explicitly set (deliberate operational choice, never an accident).
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');

async function getDb() {
  if (process.env.DATABASE_URL && process.env.PATAFUNDI_EMBEDDED_DB !== '1') {
    try {
      const { getPgPoolConfig } = await import('../src/pg-config.js');
      const pool = new pg.Pool(getPgPoolConfig(process.env.DATABASE_URL, { connectionTimeoutMillis: 5000 }));
      await pool.query('select 1');
      console.log('[cleanup] using PostgreSQL from DATABASE_URL');
      return pool;
    } catch {
      console.warn('[cleanup] DATABASE_URL unreachable - falling back to embedded PostgreSQL (PGlite)');
    }
  }
  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  const { getEmbeddedDb } = await import('../src/pglite-instance.js');
  return getEmbeddedDb();
}

// Demo fixtures use the reserved .test domain (never routable, never real).
// The legacy seed script also created exact @patafundi.com demo accounts -
// matched by EXACT email list only, never by domain, so a real customer
// whose address happens to be @patafundi.com can never be affected.
const DEMO_EMAIL_LIKE = '%@patafundi.test';
// Reserved non-routable testing domain used by test seed fixtures.
const TEST_EMAIL_LIKE = '%@test.local';
const LEGACY_DEMO_EMAILS = [
  'demo@patafundi.com', 'fundi@patafundi.com', 'admin@patafundi.com',
  'ops@patafundi.com', 'support@patafundi.com', 'fraud@patafundi.com',
  'finance@patafundi.com', 'dispatch@patafundi.com', 'company@patafundi.com',
  'devops@patafundi.com', 'auditor@patafundi.com', 'technician@patafundi.com',
  'dispatcher@patafundi.com',
];
const OWNER_EMAIL = 'emmanuelevian@gmail.com';

async function tableExists(db, name) {
  const res = await db.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
    [name],
  );
  return Boolean(res.rows[0]);
}

async function columnExists(db, table, column) {
  const res = await db.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, column],
  );
  return Boolean(res.rows[0]);
}

export async function cleanupDemoData({ dryRun = DRY_RUN } = {}) {
  if (process.env.NODE_ENV === 'production' && process.env.PATAFUNDI_ALLOW_PROD_CLEANUP !== '1') {
    throw new Error(
      '[cleanup] refusing to purge data in production without PATAFUNDI_ALLOW_PROD_CLEANUP=1 (safety guard)',
    );
  }
  const db = await getDb();

  // A fresh database has no schema yet - nothing to purge (migrations create
  // the tables; seeding happens afterwards in the reset flow).
  if (!(await tableExists(db, 'users'))) {
    console.log('[cleanup] no users table yet (fresh database) - nothing to purge');
    return [];
  }

  // 1) Collect demo actor ids (reserved .test domain + exact legacy seeds).
  const users = await db.query(
    `select id, email, role from users
     where ((email like $1 or email like $4 or lower(email) = any($2::text[])) and email <> $3)`,
    [DEMO_EMAIL_LIKE, LEGACY_DEMO_EMAILS, OWNER_EMAIL, TEST_EMAIL_LIKE],
  );
  const demoUserIds = users.rows.map((r) => r.id);
  const demoCompanies = await db.query(`select id from company_profiles where company_name ilike 'Apex Home Services%'`);
  const demoCompanyIds = demoCompanies.rows.map((r) => r.id);

  console.log(`[cleanup] demo users: ${demoUserIds.length}, demo companies: ${demoCompanyIds.length}${dryRun ? ' (DRY RUN - nothing deleted)' : ''}`);

  const countOnly = async (sql, params) => {
    const res = await db.query(sql, params);
    return res.rows.map((r) => ({ ...r }));
  };

  const report = [];
  // Tables that reference jobs WITHOUT on-delete cascade must be cleaned
  // before the jobs themselves (payments, escrow, ledger, disputes, ...).
  const JOB_CHILD_TABLES = [
    'revenue_ledger', 'commission_records', 'escrow_transactions', 'payments',
    'refund_requests', 'payment_chargebacks', 'disputes', 'job_photos',
    'job_timeline', 'job_status_updates', 'fundi_job_offers', 'gps_history',
    'gps_validations', 'settlements', 'company_settlements', 'chat_messages', 'payouts',
    'job_ratings', 'fraud_signals', 'risk_events', 'expected_commissions',
  ];

  const purgeJobChildren = async (jobIds) => {
    if (!dryRun) {
      for (const table of JOB_CHILD_TABLES) {
        if (!(await tableExists(db, table))) continue;
        if (!(await columnExists(db, table, 'job_id'))) continue;
        await db.query(`delete from ${table} where job_id = any($1::uuid[])`, [jobIds]).catch(() => {});
      }
      // reviews reference jobs too (no FK cascade in some schemas)
      if (await tableExists(db, 'reviews')) {
        await db.query(`delete from reviews where job_id = any($1::uuid[])`, [jobIds]).catch(() => {});
      }
    }
  };

  const purgeJobsBy = async (column, ids, label) => {
    if (!ids.length || !(await tableExists(db, 'jobs'))) return;
    const rows = await countOnly(
      `select id, booking_number from jobs where ${column} = any($1::uuid[])`,
      [ids],
    );
    report.push([label, rows.length]);
    if (!dryRun && rows.length) {
      await purgeJobChildren(rows.map((r) => r.id));
      // Cascades take care of remaining children (quotes, photos, timeline).
      await db.query(`delete from jobs where ${column} = any($1::uuid[])`, [ids]);
    }
  };

  // 2) Jobs owned by demo actors (customers) or demo companies/technicians.
  await purgeJobsBy('customer_id', demoUserIds, 'demo customer jobs');
  await purgeJobsBy('company_id', demoCompanyIds, 'demo company jobs');
  if (demoUserIds.length && (await columnExists(db, 'jobs', 'fundi_id'))) {
    await purgeJobsBy('fundi_id', demoUserIds, 'demo fundi jobs');
  }

  // 3) Direct-owned rows for demo users (FK-cascaded when the user row goes,
  // but explicit deletes keep the report honest and cover non-cascade FKs).
  const userOwned = [
    ['notifications', 'user_id'],
    ['devices', 'user_id'],
    ['support_tickets', 'user_id'],
    ['career_applications', 'user_id'],
    ['trust_scores', 'user_id'],
  ];
  for (const [table, column] of userOwned) {
    if (!(await tableExists(db, table)) || !(await columnExists(db, table, column))) continue;
    const pk = (await columnExists(db, table, 'id')) ? 'id' : column;
    const rows = await countOnly(`select ${pk} as id from ${table} where ${column} = any($1::uuid[])`, [demoUserIds]);
    report.push([`demo rows in ${table}`, rows.length]);
    if (!dryRun && rows.length) {
      await db.query(`delete from ${table} where ${column} = any($1::uuid[])`, [demoUserIds]);
    }
  }

  // 4) Demo company members + profiles (cascades to services/settlements).
  for (const companyId of demoCompanyIds) {
    for (const table of ['company_members', 'company_services', 'company_settlements', 'company_payout_requests']) {
      if (!(await tableExists(db, table))) continue;
      const col = table === 'company_members' ? 'company_id' : 'company_id';
      const rows = await countOnly(`select id from ${table} where ${col} = $1`, [companyId]);
      report.push([`demo rows in ${table}`, rows.length]);
      if (!dryRun && rows.length) await db.query(`delete from ${table} where ${col} = $1`, [companyId]);
    }
    const prof = await countOnly(`select id from company_profiles where id = $1`, [companyId]);
    report.push(['demo company profile', prof.length]);
    if (!dryRun && prof.length) await db.query(`delete from company_profiles where id = $1`, [companyId]);
  }

  // 5) Demo user profiles that do not cascade (fundis rows reference users).
  if (demoUserIds.length && (await tableExists(db, 'fundis'))) {
    const rows = await countOnly(`select user_id from fundis where user_id = any($1::uuid[])`, [demoUserIds]);
    report.push(['demo fundi profiles', rows.length]);
    if (!dryRun && rows.length) await db.query(`delete from fundis where user_id = any($1::uuid[])`, [demoUserIds]);
  }

  // 5b) Demo actors' audit_logs block user deletion (no FK cascade).
  if (demoUserIds.length && (await tableExists(db, 'audit_logs'))) {
    const rows = await countOnly(`select id from audit_logs where user_id = any($1::uuid[])`, [demoUserIds]);
    report.push(['demo rows in audit_logs', rows.length]);
    if (!dryRun && rows.length) {
      await db.query(`delete from audit_logs where user_id = any($1::uuid[])`, [demoUserIds]);
    }
  }

  // 6) Finally the demo user rows themselves.
  if (demoUserIds.length) {
    report.push(['demo user accounts', demoUserIds.length]);
    if (!dryRun) {
      await db.query(`delete from users where id = any($1::uuid[])`, [demoUserIds]);
    }
  }

  for (const [label, count] of report) {
    console.log(`[cleanup] ${label}: ${count}${dryRun ? ' (would delete)' : ' deleted'}`);
  }
  console.log(`[cleanup] done${dryRun ? ' (dry run)' : ''}. Platform config, services and the owner account are untouched.`);
  return report;
}

// CLI entry (not used when imported by the reset script).
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupDemoData().catch((err) => {
    console.error('[cleanup] FAILED:', err.message);
    process.exit(1);
  });
}
