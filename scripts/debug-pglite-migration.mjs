import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const tmp = path.resolve('.pgdata-debug-migration');
if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
const db = new PGlite(tmp);
await db.waitReady;
console.log('db ready', tmp);
await db.exec('create extension if not exists pgcrypto;');
await db.exec(`create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  phone text,
  role text not null check (role in ('customer', 'fundi', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  trust_score integer not null default 75 check (trust_score between 0 and 100),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`);
console.log('created users');
await db.exec('alter table users drop constraint if exists users_role_check;');
console.log('dropped constraint');
try {
  await db.exec("alter table users add constraint users_role_check check (role in ('customer', 'fundi_pending', 'fundi', 'admin')); ");
  console.log('added constraint');
} catch (err) {
  console.error('constraint failed', err.message);
}
await db.exec("insert into users (email, password_hash, full_name, role, status, trust_score, settings) values ('a@test.com', 'x', 'A', 'customer', 'active', 75, '{}');");
console.log('inserted row');
await db.exec('select count(*) as c from users').then((res) => console.log('count', res.rows[0].c));
await db.end?.();
