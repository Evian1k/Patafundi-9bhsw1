import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { getEmbeddedDb } from '../src/pglite-instance.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../migrations');

const demoUsers = [
  { email: 'demo@patafundi.com', password: 'Demo@2024!', fullName: 'Demo Customer', role: 'customer', phone: '254712000001' },
  { email: 'fundi@patafundi.com', password: 'Fundi@2024!', fullName: 'Demo Fundi', role: 'fundi', phone: '254712000002' },
  { email: 'admin@patafundi.com', password: 'Admin@2024!', fullName: 'Demo Admin', role: 'admin', phone: '254712000003' },
];

async function execSql(db, sql) {
  const statements = sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  for (const statement of statements) {
    if (/create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i.test(statement)) continue;
    await db.exec(`${statement};`);
  }
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
  const appliedSet = new Set(applied.rows.map((row) => row.filename));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);
    await execSql(db, sql);
    await db.query('insert into schema_migrations (filename) values ($1)', [file]);
  }
}

async function ensureCustomersTable(db) {
  const check = await db.query(`select to_regclass('public.customers') as t`);
  if (check.rows[0]?.t) return;
  await db.exec(`
    create table if not exists customers (
      user_id uuid primary key references users(id) on delete cascade,
      default_location_name text,
      created_at timestamptz not null default now()
    );
  `);
}

async function seedIfEmpty(db) {
  const users = await db.query(`select to_regclass('public.users') as users_table`);
  if (!users.rows[0]?.users_table) return;

  for (const user of demoUsers) {
    const existing = await db.query('select id from users where lower(email) = lower($1)', [user.email]);
    if (existing.rows[0]) continue;

    const hash = await bcrypt.hash(user.password, 12);
    const inserted = await db.query(
      `insert into users (email, password_hash, full_name, phone, role, status)
       values (lower($1), $2, $3, $4, $5, 'active')
       on conflict (email) do update set password_hash = excluded.password_hash, full_name = excluded.full_name
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
      const hasCustomers = await db.query(`select to_regclass('public.customers') as t`);
      if (hasCustomers.rows[0]?.t) {
        await db.query(
          `insert into customers (user_id) values ($1) on conflict (user_id) do nothing`,
          [row.id],
        );
      }
    }
    console.log(`[seed] ${row.email} (${row.role})`);
  }
}

export async function ensureDevDatabase() {
  if (process.env.NODE_ENV === 'production') return;

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
