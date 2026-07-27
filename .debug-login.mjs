import { query } from './backend/src/db.js';
import bcrypt from 'bcryptjs';
import { config } from './backend/src/config.js';

console.log('NODE_ENV=', process.env.NODE_ENV);
console.log('DATABASE_URL=', process.env.DATABASE_URL);
console.log('config.databaseUrl=', config.databaseUrl);
const email = 'demo@patafundi.com';
const password = 'Demo@2024!';
try {
  const result = await query(
    `select id, email, password_hash, status, email_verified_at, failed_login_attempts, locked_until
     from users where lower(email) = lower($1)`,
    [email],
  );
  console.log('userRow=', JSON.stringify(result.rows[0], null, 2));
  if (result.rows[0]) {
    const cmp = await bcrypt.compare(password, result.rows[0].password_hash);
    console.log('bcrypt compare:', cmp);
  }
} catch (err) {
  console.error('error', err);
}
