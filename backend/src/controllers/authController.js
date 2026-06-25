import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { badRequest, forbidden } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { sendOtpEmail } from '../services/emailService.js';
import { encrypt, decrypt } from '../services/encryptionService.js';

/** Decrypt phone for user response (PII protection) */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone ? decrypt(user.phone) : null,
    role: user.role,
    status: user.status,
    trustScore: user.trust_score,
    emailVerified: Boolean(user.email_verified_at),
  };
}
import { verifyOtpWithLockout } from '../services/fraudService.js';
import { createFundiRegistration } from '../services/fundiRegistrationService.js';
import { clearAuthCookies, setAuthCookies, signAccessToken, signRefreshToken } from '../middleware/auth.js';

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
    message: 'OTP generated (development fallback — check email or use devOtp)',
  };
}

async function storeOtp(userId, purpose, code) {
  await query(
    `insert into otp_codes (user_id, purpose, code_hash, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')`,
    [userId, purpose, await bcrypt.hash(code, 10)],
  );
}

async function deliverOtp(email, code, purpose) {
  const emailResult = await sendOtpEmail({ to: email, code, purpose });
  return {
    message: emailResult.sent
      ? 'OTP sent to your email'
      : 'OTP generated. Email delivery is temporarily unavailable — try resend or contact support.',
    emailSent: emailResult.sent,
    ...devOtpPayload(code),
  };
}

async function findValidOtp(email, purpose) {
  const result = await query(
    `select oc.id, oc.code_hash, u.id as user_id, u.email, u.full_name, u.phone, u.role, u.status, u.trust_score, u.email_verified_at
     from otp_codes oc join users u on u.id = oc.user_id
     where lower(u.email) = lower($1) and oc.purpose = $2 and oc.consumed_at is null and oc.expires_at > now()
     order by oc.created_at desc limit 1`,
    [email, purpose],
  );
  return result.rows[0] || null;
}

export async function register(req, res) {
  const { email, password, fullName, phone, referralCode } = req.body || {};
  const role = 'customer';
  if (!email || !password || !fullName) throw badRequest('Email, password, and full name are required');
  requireStrongPassword(password);
  if (req.body?.role === 'admin') throw forbidden('Admin accounts must be provisioned by an existing administrator');
  const passwordHash = await bcrypt.hash(password, 12);
  const otpCode = String(crypto.randomInt(100000, 999999));
  const user = await transaction(async (client) => {
    const existing = await client.query('select id from users where lower(email) = lower($1)', [email]);
    if (existing.rows[0]) throw badRequest('Email is already registered');
    const inserted = await client.query(
      `insert into users (email, password_hash, full_name, phone, role, status, email_verified_at)
       values (lower($1), $2, $3, $4, $5, 'active', null)
       returning id, email, full_name, phone, role, status, trust_score, email_verified_at`,
      [email, passwordHash, fullName, phone ? encrypt(phone) : null, role],
    );
    await client.query(
      `insert into trust_scores (user_id, score, level) values ($1, 100, 'standard')`,
      [inserted.rows[0].id],
    );
    await client.query(
      `insert into user_fraud_scores (user_id, fraud_score, risk_level) values ($1, 0, 'low')`,
      [inserted.rows[0].id],
    );
    await client.query(
      `insert into user_loyalty (user_id, tier, points, jobs_completed, total_spent) values ($1, 'bronze', 0, 0, 0)`,
      [inserted.rows[0].id],
    );
    await client.query(
      `insert into otp_codes (user_id, purpose, code_hash, expires_at)
       values ($1, 'register', $2, now() + interval '10 minutes')`,
      [inserted.rows[0].id, await bcrypt.hash(otpCode, 10)],
    );

    // Process referral code if provided (new voucher-based system)
    // This creates a 'pending' referral row. The voucher is issued only
    // after the referee verifies email + completes first paid job.
    if (referralCode) {
      try {
        const { validateReferralCode, createReferral } = await import('../services/referralService.js');
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const deviceFingerprint = req.get('X-Device-Fingerprint') || null;
        const validation = await validateReferralCode(
          referralCode,
          inserted.rows[0].id,
          email,
          phone || null,
          ipAddress,
          deviceFingerprint,
        );
        if (validation.valid) {
          await createReferral({
            referrerId: validation.referrerId,
            refereeId: inserted.rows[0].id,
            code: referralCode.toUpperCase().trim(),
            campaignId: validation.campaignId,
            ipAddress,
            deviceFingerprint,
          });
        }
        // If invalid, silently ignore — don't fail registration
      } catch (err) {
        console.warn('[referral] could not process referral code during registration:', err.message);
        // Don't fail registration if referral processing fails
      }
    }

    return inserted.rows[0];
  });
  await auditLog({ userId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id });
  const otpDelivery = await deliverOtp(email, otpCode, 'register');
  res.status(201).json({
    success: true,
    otpRequired: true,
    email: user.email,
    ...otpDelivery,
  });
}

/** Public fundi onboarding — creates account + fundi profile + verification docs, then sends OTP. */
export async function registerFundi(req, res) {
  const { body, files } = req;
  const result = await createFundiRegistration({ body, files });
  const otpDelivery = await deliverOtp(result.user.email, result.otpCode, 'register');
  await auditLog({
    userId: result.user.id,
    action: 'auth.register_fundi',
    entityType: 'fundi',
    entityId: result.fundi.id,
    metadata: { verification: result.verification?.verificationResult || null },
  });
  res.status(201).json({
    success: true,
    otpRequired: true,
    email: result.user.email,
    fundiId: result.fundi.id,
    verification: result.verification,
    message: 'Fundi account created. Verify your email to continue.',
    ...otpDelivery,
  });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw badRequest('Email and password are required');

  // ── Account lockout check ────────────────────────────────────────
  // Prevents brute force attacks even if rate limiter is bypassed
  // (e.g., attacker uses multiple IPs via botnet)
  const { checkAccountLock, recordFailedLogin, recordSuccessfulLogin } = await import('../services/securityService.js');
  const lockStatus = await checkAccountLock(email);
  if (lockStatus.locked) {
    const minsLeft = Math.ceil((new Date(lockStatus.until).getTime() - Date.now()) / 60000);
    throw forbidden(`Account temporarily locked due to repeated failed login attempts. Try again in ${minsLeft} minute(s).`);
  }

  const result = await query(
    `select id, email, password_hash, full_name, phone, role, status, trust_score, email_verified_at
     from users where lower(email) = lower($1)`,
    [email],
  );
  const user = result.rows[0];

  // ── Record failed login attempt ──────────────────────────────────
  // Always run this (even if user doesn't exist) to prevent timing
  // attacks that reveal whether an email is registered. However, the
  // recordFailedLogin function silently returns if user doesn't exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    if (user) {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const failResult = await recordFailedLogin(email, ip);
      if (failResult?.locked) {
        throw forbidden('Account locked due to too many failed login attempts. Try again in 15 minutes.');
      }
    }
    throw forbidden('Invalid email or password');
  }

  if (user.status !== 'active') throw forbidden('Account is not active');
  if (!user.email_verified_at) {
    throw forbidden('Email not verified. Please check your inbox for the verification code.');
  }

  // ── Record successful login ──────────────────────────────────────
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  await recordSuccessfulLogin(user.id, ip);

  const session = await issueSession(res, user);
  await auditLog({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, metadata: { ip } });
  // Return BOTH access token and refresh token in JSON body.
  // The refresh token is also set as an httpOnly cookie for same-origin use,
  // but cross-origin deployments (Vercel frontend → Render backend) cannot
  // use cookies due to sameSite:'strict'. The frontend stores the refresh
  // token in localStorage and sends it in the request body to /auth/refresh.
  res.json({ success: true, user: publicUser(user), token: session.token, refreshToken: session.refreshToken });
}

export async function refresh(req, res) {
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!refreshToken) throw forbidden('Refresh token required');
  const payload = jwt.verify(refreshToken, config.refreshSecret || config.jwtSecret, {
    issuer: 'patafundi-api',
    audience: 'patafundi-web',
    algorithms: ['HS256'],
  });
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await query(
    `select u.id, u.email, u.full_name, u.phone, u.role, u.status, u.trust_score, u.email_verified_at
     from refresh_tokens rt join users u on u.id = rt.user_id
     where rt.token_hash = $1 and rt.revoked_at is null and rt.expires_at > now() and u.id = $2`,
    [refreshHash, payload.sub],
  );
  const user = result.rows[0];
  if (!user) throw forbidden('Invalid refresh token');
  if (user.status !== 'active') throw forbidden('Account is not active');
  if (!user.email_verified_at) throw forbidden('Email not verified');
  await query('update refresh_tokens set revoked_at = now() where token_hash = $1', [refreshHash]);
  const session = await issueSession(res, user);
  // Return new refresh token too so frontend can update its stored token
  res.json({ success: true, token: session.token, refreshToken: session.refreshToken, user: publicUser(user) });
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
  const result = await verifyOtpWithLockout({
    email,
    purpose,
    code,
    verifyFn: (otp) => bcrypt.compare(String(code), otp.code_hash),
  });
  if (!result.ok) throw forbidden(result.error);
  const row = result.user;

  if (purpose === 'password_reset') {
    return res.json({ success: true, message: 'OTP verified. You can now set a new password.' });
  }

  if (purpose === 'register') {
    await query(
      'update users set email_verified_at = now(), updated_at = now() where id = $1 and email_verified_at is null',
      [row.user_id],
    );
  }

  const user = {
    id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    trust_score: row.trust_score,
    email_verified_at: purpose === 'register' ? new Date() : row.email_verified_at,
  };
  const session = await issueSession(res, user);
  res.json({ success: true, token: session.token, user: publicUser(user) });
}

export async function otpResend(req, res) {
  const { email, purpose = 'register' } = req.body || {};
  if (!email) throw badRequest('Email is required');
  const recent = await query(
    `select count(*)::int as cnt from otp_codes oc
     join users u on u.id = oc.user_id
     where lower(u.email) = lower($1) and oc.created_at > now() - interval '1 hour'`,
    [email],
  );
  if (Number(recent.rows[0]?.cnt || 0) >= 5) throw forbidden('Too many OTP requests. Try again later.');
  const userResult = await query(
    'select id, email_verified_at from users where lower(email) = lower($1)',
    [email],
  );
  const user = userResult.rows[0];
  if (!user) throw badRequest('Account not found');
  if (purpose === 'register' && user.email_verified_at) {
    throw badRequest('Email is already verified');
  }
  const code = String(crypto.randomInt(100000, 999999));
  await storeOtp(user.id, purpose, code);
  const otpDelivery = await deliverOtp(email, code, purpose);
  res.json({ success: true, ...otpDelivery });
}

export async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) throw badRequest('Email is required');
  const userResult = await query('select id, email from users where lower(email) = lower($1)', [email]);
  const genericMessage = 'If the account exists, a verification code has been sent to your email';
  if (!userResult.rows[0]) {
    return res.json({ success: true, message: genericMessage });
  }
  const user = userResult.rows[0];
  const code = String(crypto.randomInt(100000, 999999));
  await storeOtp(user.id, 'password_reset', code);
  await deliverOtp(user.email, code, 'password_reset');
  await auditLog({ userId: user.id, action: 'auth.forgot_password', entityType: 'user', entityId: user.id });
  res.json({
    success: true,
    message: genericMessage,
    ...devOtpPayload(code),
  });
}

export async function resetPassword(req, res) {
  const { email, code, password, token } = req.body || {};

  if (email && code && password) {
    requireStrongPassword(password);
    const otpResult = await verifyOtpWithLockout({
      email,
      purpose: 'password_reset',
      code,
      verifyFn: (otp) => bcrypt.compare(String(code), otp.code_hash),
    });
    if (!otpResult.ok) throw forbidden(otpResult.error);
    const row = otpResult.user;
    const passwordHash = await bcrypt.hash(password, 12);
    await transaction(async (client) => {
      await client.query('update users set password_hash = $2, updated_at = now() where id = $1', [row.user_id, passwordHash]);
      await client.query('update otp_codes set consumed_at = now() where id = $1', [row.id]);
      await client.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [row.user_id]);
    });
    await auditLog({ userId: row.user_id, action: 'auth.reset_password', entityType: 'user', entityId: row.user_id });
    return res.json({ success: true, message: 'Password updated successfully' });
  }

  if (token && password) {
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
    return res.json({ success: true, message: 'Password updated successfully' });
  }

  throw badRequest('Email, OTP code, and new password are required');
}
