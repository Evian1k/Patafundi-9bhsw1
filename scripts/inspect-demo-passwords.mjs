import { getEmbeddedDb } from '../backend/src/pglite-instance.js';
import bcrypt from 'bcryptjs';

const db = await getEmbeddedDb();
const users = ['demo@patafundi.com', 'fundi@patafundi.com', 'admin@patafundi.com'];
for (const email of users) {
  const result = await db.query('select email, password_hash from users where lower(email)=lower($1)', [email]);
  console.log('---', email);
  console.log(result.rows[0]);
  if (result.rows[0]) {
    const pass = email.startsWith('demo') ? 'Demo@2024!' : email.startsWith('fundi') ? 'Fundi@2024!' : 'Admin@2024!';
    console.log('compare', await bcrypt.compare(pass, result.rows[0].password_hash));
  }
}
await db.close?.();
