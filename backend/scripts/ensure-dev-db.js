import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';
import { getEmbeddedDb } from '../src/pglite-instance.js';
import { getPgPoolConfig, isLocalDatabaseUrl } from '../src/pg-config.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../migrations');

const demoUsers = [
  { email: 'demo@patafundi.com', password: 'Demo@2024!', fullName: 'Demo Customer', role: 'customer', phone: '254712000001' },
  { email: 'fundi@patafundi.com', password: 'Fundi@2024!', fullName: 'Demo Fundi', role: 'fundi', phone: '254712000002' },
  { email: 'admin@patafundi.com', password: 'Admin@2024!', fullName: 'Demo Admin', role: 'admin', phone: '254712000003' },
];

async function execSql(db, sql) {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = withoutLineComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    if (/create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i.test(statement)) continue;
    await db.exec(`${statement};`);
  }
}

async function tableExists(db, tableName) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) return false;
  const result = await db.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = '${tableName}' limit 1`,
  );
  return Boolean(result.rows[0]);
}

async function applyMigrations(db) {
  await db.exec(`
    create table if not exists schema_migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = await db.query('select filename from schema_migrations order by filename');
  if (!(await tableExists(db, 'users')) && applied.rows.length > 0) {
    await db.query('delete from schema_migrations');
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);
    await execSql(db, sql);
    await db.query('insert into schema_migrations (filename) values ($1) on conflict (filename) do nothing', [file]);
  }
}

async function ensureCustomersTable(db) {
  if (await tableExists(db, 'customers')) return;
  const sql = `
    create table if not exists customers (
      user_id uuid primary key references users(id) on delete cascade,
      default_location_name text,
      created_at timestamptz not null default now()
    )
  `;
  if (typeof db.exec === 'function') await db.exec(`${sql};`);
  else await db.query(sql);
}

async function seedIfEmpty(db) {
  if (!(await tableExists(db, 'users'))) return;

  for (const user of demoUsers) {
    const existing = await db.query('select id from users where lower(email) = lower($1)', [user.email]);
    if (existing.rows[0]) continue;

    const hash = await bcrypt.hash(user.password, 12);
    const inserted = await db.query(
      `insert into users (email, password_hash, full_name, phone, role, status, email_verified_at)
       values (lower($1), $2, $3, $4, $5, 'active', now())
       on conflict (email) do update set
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        email_verified_at = coalesce(users.email_verified_at, now())
       returning id, email, role`,
      [user.email, hash, user.fullName, user.phone, user.role],
    );
    const row = inserted.rows[0];
    await db.query(
      `insert into trust_scores (user_id, score, level) values ($1, 85, 'trusted')
       on conflict (user_id) do nothing`,
      [row.id],
    );
    if (user.role === 'fundi') {
      await db.query(
        `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, online)
         values ($1, $2, $3, $4, 'approved', false)
         on conflict (user_id) do update set approval_status = 'approved'`,
        [row.id, ['plumbing', 'electrical'], '5 years experience', user.phone],
      );
      await db.query(
        `insert into wallets (user_id, balance, currency) values ($1, 0, 'KES')
         on conflict (user_id) do nothing`,
        [row.id],
      );
    }
    if (user.role === 'customer') {
      if (await tableExists(db, 'customers')) {
        await db.query(
          `insert into customers (user_id) values ($1) on conflict (user_id) do nothing`,
          [row.id],
        );
      }
    }
    console.log(`[seed] ${row.email} (${row.role})`);
  }
}

async function ensurePostgresDatabase(databaseUrl) {
  try {
    const pool = new pg.Pool(getPgPoolConfig(databaseUrl, { connectionTimeoutMillis: 3000 }));
    await pool.query('select 1');
    await pool.end();
    return true;
  } catch (error) {
    if (!/database .* does not exist/i.test(error.message)) throw error;
    const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
    const dbName = parsed.pathname.replace(/^\//, '');
    const adminUrl = databaseUrl.replace(`/${dbName}`, '/postgres');
    const admin = new pg.Pool(getPgPoolConfig(adminUrl, { connectionTimeoutMillis: 3000 }));
    try {
      await admin.query(`create database "${dbName.replace(/"/g, '""')}"`);
      console.log(`[PataFundi] Created database ${dbName}`);
    } finally {
      await admin.end();
    }
    return true;
  }
}

export async function bootstrapPostgresDatabase({ required = false } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (required) throw new Error('DATABASE_URL is required');
    return false;
  }

  if (process.env.NODE_ENV === 'production' && isLocalDatabaseUrl(databaseUrl)) {
    const msg = 'DATABASE_URL must not point to localhost in production';
    if (required) throw new Error(msg);
    console.error(`[PataFundi] ${msg}`);
    return false;
  }

  await ensurePostgresDatabase(databaseUrl);
  const pool = new pg.Pool(getPgPoolConfig(databaseUrl));
  try {
    await pool.query('select 1');
    await pool.query(`
      create table if not exists schema_migrations (
        id serial primary key,
        filename text not null unique,
        applied_at timestamptz not null default now()
      )
    `);
    const applied = await pool.query('select filename from schema_migrations order by filename');
    const appliedSet = new Set(applied.rows.map((row) => row.filename));
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] apply ${file}`);
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('insert into schema_migrations (filename) values ($1)', [file]);
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
    await ensureCustomersTable(pool);
    await seedIfEmpty(pool);
    await pool.end();
    console.log('[PataFundi] PostgreSQL database ready');
    return true;
  } catch (error) {
    await pool.end().catch(() => {});
    if (required) throw error;
    console.warn(`[PataFundi] PostgreSQL unavailable (${error.message}); falling back to embedded DB`);
    return false;
  }
}

export async function ensureProductionDatabase() {
  if (process.env.NODE_ENV !== 'production') return true;
  return bootstrapPostgresDatabase({ required: false });
}

export async function ensureDevDatabase() {
  if (process.env.NODE_ENV === 'production') {
    return ensureProductionDatabase();
  }

  if (await bootstrapPostgresDatabase()) return;

  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  const db = await getEmbeddedDb();
  await applyMigrations(db);
  await ensureCustomersTable(db);
  await seedIfEmpty(db);
  console.log('[PataFundi] Embedded database ready');
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  ensureDevDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[PataFundi]', error.message);
      process.exit(1);
    });
}
