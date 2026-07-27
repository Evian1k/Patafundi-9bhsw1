import { login } from '../backend/src/controllers/authController.js';
import { query } from '../backend/src/db.js';
import bcrypt from 'bcryptjs';

const email = 'demo@patafundi.com';
const password = 'Demo@2024!';
console.log('starting debug-auth-login');

const row = await query('select id, email, password_hash, status, email_verified_at, failed_login_attempts, locked_until from users where lower(email)=lower($1)', [email]);
console.log('user row:', JSON.stringify(row.rows[0], null, 2));
if (row.rows[0]) {
  const match = await bcrypt.compare(password, row.rows[0].password_hash);
  console.log('bcrypt compare direct:', match);
}

const req = {
  body: { email, password },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  get: () => null,
  cookies: {},
};
const res = {
  status(code) { this.status = code; return this; },
  json(payload) { console.log('login response payload:', JSON.stringify(payload, null, 2)); return this; },
  cookie(name, value, opts) { console.log('cookie set', name, value, opts); this.cookies = this.cookies || {}; this.cookies[name] = value; return this; },
  clearCookie(name, opts) { console.log('clearCookie', name, opts); return this; },
};
try {
  await login(req, res);
  console.log('login controller finished');
} catch (error) {
  console.error('login controller error', error.message);
  console.error(error.stack);
}
