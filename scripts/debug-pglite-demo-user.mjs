import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';

const dataDir = path.resolve('.pgdata');
const db = new PGlite(dataDir);
await db.waitReady;
const email = 'demo@patafundi.com';
const res = await db.query('select id, email, password_hash, role, status from users where lower(email) = lower($1)', [email]);
console.log('rows', res.rows.length, JSON.stringify(res.rows, null, 2));
if (res.rows[0]) {
  const ok = await bcrypt.compare('Demo@2024!', res.rows[0].password_hash);
  console.log('bcrypt ok', ok);
}
