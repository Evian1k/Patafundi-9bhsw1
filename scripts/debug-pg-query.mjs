import { getEmbeddedDb } from '../backend/src/pglite-instance.js';
import { query as wrappedQuery } from '../backend/src/db.js';
import bcrypt from 'bcryptjs';

const email = 'demo@patafundi.com';
console.log('=== direct PGlite ===');
const db = await getEmbeddedDb();
for (const sql of [
  'select email, password_hash from users where lower(email)=lower($1)',
  'select email, password_hash from users where email=lower($1)',
  'select email, password_hash from users where email=$1',
  'select lower($1) as lowered',
]) {
  try {
    const res = await db.query(sql, [email]);
    console.log('SQL:', sql);
    console.log('rows:', res.rows.length, JSON.stringify(res.rows[0] || null));
  } catch (err) {
    console.error('SQL failed:', sql);
    console.error(err);
  }
}

console.log('=== wrapped query ===');
for (const sql of [
  'select email, password_hash from users where lower(email)=lower($1)',
  'select email, password_hash from users where email=lower($1)',
  'select email, password_hash from users where email=$1',
]) {
  try {
    const res = await wrappedQuery(sql, [email]);
    console.log('SQL:', sql);
    console.log('rows:', res.rows.length, JSON.stringify(res.rows[0] || null));
    if (res.rows[0]) {
      console.log('bcrypt compare', await bcrypt.compare('Demo@2024!', res.rows[0].password_hash));
    }
  } catch (err) {
    console.error('SQL failed:', sql);
    console.error(err);
  }
}
