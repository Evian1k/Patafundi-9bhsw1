#!/usr/bin/env node
/**
 * Production owner bootstrap (spec §3).
 *
 * Creates the authorized platform owner (super_admin) on a production
 * database. Dev seeds are refused in production — this script is the ONLY
 * scripted path to an owner account in production.
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=... OWNER_PASSWORD='strong-pass' \
 *     node scripts/bootstrap-owner.js
 *
 * NOTE: setting OWNER_PASSWORD on Render also bootstraps the owner
 * automatically at server start (see backend/src/ownerBootstrap.js) — this
 * CLI remains for manual/one-off provisioning and role healing.
 *
 * The owner email is fixed to emmanuelevian@gmail.com (spec §3). The password
 * comes from OWNER_PASSWORD; if unset, a strong random password is generated
 * and printed ONCE to stdout. The account is created idempotently: if the
 * owner already exists the script exits successfully without touching the
 * password (password changes go through the authenticated change-password
 * flow with the owner's current credentials).
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { getPgPoolConfig, isLocalDatabaseUrl } from '../src/pg-config.js';
import { ensureOwnerAccount, OWNER_EMAIL } from '../src/ownerBootstrap.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const OWNER_NAME = 'Emmanuel Evian';

function resolvePassword() {
  let password = process.env.OWNER_PASSWORD || '';
  if (!password) {
    if (process.env.NODE_ENV === 'production' && !process.env.OWNER_PRINT_PASSWORD) {
      // In production require an explicit password unless the operator opted
      // into printing one — avoids leaking credentials into captured logs.
      console.error('[owner-bootstrap] set OWNER_PASSWORD (or OWNER_PRINT_PASSWORD=true to auto-generate and print)');
      process.exit(1);
    }
    password = crypto.randomBytes(12).toString('base64url') + '!Aa1';
  }
  if (password.length < 10) {
    console.error('[owner-bootstrap] OWNER_PASSWORD must be at least 10 characters');
    process.exit(1);
  }
  return password;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    console.error('[owner-bootstrap] DATABASE_URL is required in production');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && isLocalDatabaseUrl(process.env.DATABASE_URL || '')) {
    console.error('[owner-bootstrap] refusing to run against a localhost database in production');
    process.exit(1);
  }

  const password = resolvePassword();

  const pool = new pg.Pool(getPgPoolConfig(process.env.DATABASE_URL, { connectionTimeoutMillis: 5000 }));
  try {
    const result = await ensureOwnerAccount(pool, { password, fullName: OWNER_NAME });
    if (result.created && (process.env.OWNER_PRINT_PASSWORD || process.env.NODE_ENV !== 'production')) {
      console.log(`[owner-bootstrap] password: ${password}`);
      console.log('[owner-bootstrap] store this password securely — it is NOT shown again');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[owner-bootstrap] failed:', err.message);
  process.exit(1);
});
