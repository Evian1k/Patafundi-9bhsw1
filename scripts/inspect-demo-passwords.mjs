import { getDemoPassword } from './demo-password.mjs';
import { getEmbeddedDb } from '../backend/src/pglite-instance.js';
import bcrypt from 'bcryptjs';

const db = await getEmbeddedDb();
const users = ['demo@patafundi.com', 'fundi@patafundi.com', 'admin@patafundi.com'];
for (const email of users) {
  const result = await db.query('select email, password_hash from users where lower(email)=lower($1)', [email]);
  console.log('---', email);
  if (result.rows[0]) {
    console.log('demo password matches:', await bcrypt.compare(getDemoPassword(), result.rows[0].password_hash));
  }
}
await db.close?.();
