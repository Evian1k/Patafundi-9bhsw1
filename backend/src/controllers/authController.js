import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { badRequest, forbidden } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { clearAuthCookies, setAuthCookies, signAccessToken, signRefreshToken } from '../middleware/auth.js';

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    trustScore: user.trust_score,
  };
}

async function issueSession(res, user) {
  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query(
    `insert into refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [user.id, refreshHash],
  );
  setAuthCookies(res, token, refreshToken);
  return { token, refreshToken };
}

function requireStrongPassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw badRequest('Password must be at least 8 characters');
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw badRequest('Password must include letters and numbers');
  }
}

function devOtpPayload(code) {
  if (config.nodeEnv !== 'development') return {};
  return {
    devOtp: code,
    message: 'OTP generated (development only — configure SMS/email provider for production)',
  };
}

export async function register(req, res) {
  const { email, password, fullName, phone, role = 'customer' } = req.body || {};
  if (!email || !password || !fullName) throw badRequest('Email, password, and full name are required');
  requireStrongPassword(password);
  if (!['customer', 'fundi', 'admin'].includes(role)) throw badRequest('Invalid role');
  if (role === 'admin') throw forbidden('Admin accounts must be provisioned by an existing administrator');
  const passwordHash = await bcrypt.hash(password, 12);
  const otpCode = String(crypto.randomInt(100000, 999999));
  const user = await transaction(async (client) => {
    const existing = await client.query('select id from users where lower(email) = lower($1)', [email]);
    if (existing.rows[0]) throw badRequest('Email is already registered');
    const inserted = await client.query(
      `insert into users (email, password_hash, full_name, phone, role, status)
       values (lower($1), $2, $3, $4, $5, 'active')
       returning id, email, full_name, phone, role, status, trust_score`,
      [email, passwordHash, fullName, phone, role],
    );
    await client.query(
      `insert into trust_scores (user_id, score, level) values ($1, 75, 'standard')`,
      [inserted.rows[0].id],
    );
    await client.query(
      `insert into otp_codes (user_id, purpose, code_hash, expires_at)
       values ($1, 'register', $2, now() + interval '10 minutes')`,
      [inserted.rows[0].id, await bcrypt.hash(otpCode, 10)],
    );
    return inserted.rows[0];
  });
  await auditLog({ userId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id });
  const session = await issueSession(res, user);
  res.status(201).json({
    success: true,
    user: publicUser(user),
    token: session.token,
    otpRequired: true,
    ...devOtpPayload(otpCode),
  });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw badRequest('Email and password are required');
  const result = await query(
    'select id, email, password_hash, full_name, phone, role, status, trust_score from users where lower(email) = lower($1)',
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw forbidden('Invalid email or password');
  if (user.status !== 'active') throw forbidden('Account is not active');
  const session = await issueSession(res, user);
  await auditLog({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id });
  res.json({ success: true, user: publicUser(user), token: session.token });
}

export async function refresh(req, res) {
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!refreshToken) throw forbidden('Refresh token required');
  const payload = jwt.verify(refreshToken, config.refreshSecret || config.jwtSecret, {
    issuer: 'patafundi-api',
    audience: 'patafundi-web',
  });
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await query(
    `select u.id, u.email, u.full_name, u.phone, u.role, u.status, u.trust_score
     from refresh_tokens rt join users u on u.id = rt.user_id
     where rt.token_hash = $1 and rt.revoked_at is null and rt.expires_at > now() and u.id = $2`,
    [refreshHash, payload.sub],
  );
  const user = result.rows[0];
  if (!user) throw forbidden('Invalid refresh token');
  if (user.status !== 'active') throw forbidden('Account is not active');
  await query('update refresh_tokens set revoked_at = now() where token_hash = $1', [refreshHash]);
  const session = await issueSession(res, user);
  res.json({ success: true, token: session.token, user: publicUser(user) });
}

export async function logout(req, res) {
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (refreshToken) {
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query('update refresh_tokens set revoked_at = now() where token_hash = $1', [refreshHash]);
  }
  clearAuthCookies(res);
  res.json({ success: true });
}

export async function otpVerify(req, res) {
  const { email, code, purpose = 'register' } = req.body || {};
  if (!email || !code) throw badRequest('Email and OTP code are required');
  const result = await query(
    `select oc.id, oc.code_hash, u.id as user_id, u.email, u.full_name, u.phone, u.role, u.status, u.trust_score
     from otp_codes oc join users u on u.id = oc.user_id
     where lower(u.email) = lower($1) and oc.purpose = $2 and oc.consumed_at is null and oc.expires_at > now()
     order by oc.created_at desc limit 1`,
    [email, purpose],
  );
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(code, row.code_hash))) throw forbidden('Invalid OTP code');
  await query('update otp_codes set consumed_at = now() where id = $1', [row.id]);
  const user = {
    id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    trust_score: row.trust_score,
  };
  const session = await issueSession(res, user);
  res.json({ success: true, token: session.token, user: publicUser(user) });
}

export async function otpResend(req, res) {
  const { email, purpose = 'register' } = req.body || {};
  if (!email) throw badRequest('Email is required');
  const userResult = await query('select id from users where lower(email) = lower($1)', [email]);
  if (!userResult.rows[0]) throw badRequest('Account not found');
  const code = String(crypto.randomInt(100000, 999999));
  await query(
    `insert into otp_codes (user_id, purpose, code_hash, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')`,
    [userResult.rows[0].id, purpose, await bcrypt.hash(code, 10)],
  );
  res.json({ success: true, message: 'OTP sent', ...devOtpPayload(code) });
}

export async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) throw badRequest('Email is required');
  const userResult = await query('select id, email from users where lower(email) = lower($1)', [email]);
  if (!userResult.rows[0]) {
    return res.json({ success: true, message: 'If the account exists, a reset link has been sent' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 hour')`,
    [userResult.rows[0].id, tokenHash],
  );
  await auditLog({ userId: userResult.rows[0].id, action: 'auth.forgot_password', entityType: 'user', entityId: userResult.rows[0].id });
  res.json({
    success: true,
    message: 'If the account exists, a reset link has been sent',
    resetToken: config.nodeEnv === 'development' ? token : undefined,
  });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) throw badRequest('Token and new password are required');
  requireStrongPassword(password);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    `select prt.id, prt.user_id from password_reset_tokens prt
     where prt.token_hash = $1 and prt.consumed_at is null and prt.expires_at > now()
     order by prt.created_at desc limit 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) throw forbidden('Invalid or expired reset token');
  const passwordHash = await bcrypt.hash(password, 12);
  await transaction(async (client) => {
    await client.query('update users set password_hash = $2, updated_at = now() where id = $1', [row.user_id, passwordHash]);
    await client.query('update password_reset_tokens set consumed_at = now() where id = $1', [row.id]);
    await client.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [row.user_id]);
  });
  await auditLog({ userId: row.user_id, action: 'auth.reset_password', entityType: 'user', entityId: row.user_id });
  res.json({ success: true, message: 'Password updated successfully' });
}
