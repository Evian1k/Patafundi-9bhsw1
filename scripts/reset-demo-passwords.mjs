import bcrypt from 'bcryptjs';
import { getEmbeddedDb } from '../backend/src/pglite-instance.js';

const db = await getEmbeddedDb();
const users = [
  ['demo@patafundi.com', 'Demo@2024!'],
  ['fundi@patafundi.com', 'Fundi@2024!'],
  ['admin@patafundi.com', 'Admin@2024!'],
  ['ops@patafundi.com', 'Ops@2024!'],
  ['support@patafundi.com', 'Support@2024!'],
  ['fraud@patafundi.com', 'Fraud@2024!'],
  ['finance@patafundi.com', 'Finance@2024!'],
  ['dispatch@patafundi.com', 'Dispatch@2024!'],
  ['devops@patafundi.com', 'Devops@2024!'],
  ['auditor@patafundi.com', 'Auditor@2024!'],
];

for (const [email, password] of users) {
  const hash = await bcrypt.hash(password, 12);
  await db.query('update users set password_hash = $1 where lower(email) = lower($2)', [hash, email]);
  console.log('updated', email);
}

await db.close?.();
