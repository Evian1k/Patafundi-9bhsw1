import { getDemoPassword } from './demo-password.mjs';
import bcrypt from 'bcryptjs';
import { getEmbeddedDb } from '../backend/src/pglite-instance.js';
import { canSeedDemoData } from '../backend/src/demoDataPolicy.js';

if (!canSeedDemoData({ embedded: '1' })) {
  throw new Error('Demo password reset is restricted to isolated development/test storage');
}
const db = await getEmbeddedDb();
const users = [
  ['demo@patafundi.com', getDemoPassword()],
  ['fundi@patafundi.com', getDemoPassword()],
  ['admin@patafundi.com', getDemoPassword()],
  ['ops@patafundi.com', getDemoPassword()],
  ['support@patafundi.com', getDemoPassword()],
  ['fraud@patafundi.com', getDemoPassword()],
  ['finance@patafundi.com', getDemoPassword()],
  ['dispatch@patafundi.com', getDemoPassword()],
  ['devops@patafundi.com', getDemoPassword()],
  ['auditor@patafundi.com', getDemoPassword()],
];

try {
  for (const [email, password] of users) {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'update users set password_hash = $1 where lower(email) = lower($2) and is_demo = true returning id',
      [hash, email],
    );
    console.log(result.rowCount ? `updated demo account ${email}` : `skipped non-demo or missing account ${email}`);
  }
} finally {
  await db.close?.();
}
