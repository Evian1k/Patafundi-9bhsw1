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
 * The owner email is fixed to emmanuelevian@gmail.com (spec §3). The password
 * comes from OWNER_PASSWORD; if unset, a strong random password is generated
 * and printed ONCE to stdout. The account is created idempotently: if the
 * owner already exists the script exits successfully without touching the
 * password (password changes go through the authenticated change-password
 * flow with the owner's current credentials).
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { getPgPoolConfig, isLocalDatabaseUrl } from '../src/pg-config.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const OWNER_EMAIL = 'emmanuelevian@gmail.com';
const OWNER_NAME = 'Emmanuel Evian';

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    console.error('[owner-bootstrap] DATABASE_URL is required in production');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && isLocalDatabaseUrl(process.env.DATABASE_URL || '')) {
    console.error('[owner-bootstrap] refusing to run against a localhost database in production');
    process.exit(1);
  }

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

  const pool = new pg.Pool(getPgPoolConfig(process.env.DATABASE_URL, { connectionTimeoutMillis: 5000 }));
  try {
    const existing = await pool.query('select id, role from users where lower(email) = lower($1)', [OWNER_EMAIL]);
    if (existing.rows[0]) {
      const role = existing.rows[0].role;
      if (role !== 'super_admin') {
        // The spec names this account as THE owner — heal the role if it drifted.
        await pool.query(`update users set role = 'super_admin', status = 'active' where id = $1`, [existing.rows[0].id]);
        console.log(`[owner-bootstrap] ${OWNER_EMAIL} existed as "${role}" — elevated to super_admin`);
      } else {
        console.log(`[owner-bootstrap] ${OWNER_EMAIL} already exists as super_admin — nothing to do`);
      }
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `insert into users (email, password_hash, full_name, role, status, email_verified_at)
       values (lower($1), $2, $3, 'super_admin', 'active', now())
       returning id`,
      [OWNER_EMAIL, hash, OWNER_NAME],
    );
    await pool.query(
      `insert into trust_scores (user_id, score, level) values ($1, 100, 'trusted') on conflict (user_id) do nothing`,
      [inserted.rows[0].id],
    );
    console.log(`[owner-bootstrap] owner account created: ${OWNER_EMAIL} (super_admin)`);
    if (process.env.OWNER_PRINT_PASSWORD || process.env.NODE_ENV !== 'production') {
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
