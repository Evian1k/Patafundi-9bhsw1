import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config, requireConfig } from '../config.js';
import { query } from '../db.js';
import { forbidden } from '../utils/http.js';

export function signAccessToken(user) {
  requireConfig(config.jwtSecret, 'JWT_SECRET');
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, roles: [user.role] },
    config.jwtSecret,
    { expiresIn: '15m', issuer: 'patafundi-api', audience: 'patafundi-web' },
  );
}

export function signRefreshToken(user) {
  requireConfig(config.refreshSecret || config.jwtSecret, 'REFRESH_TOKEN_SECRET');
  return jwt.sign(
    { sub: user.id, tokenType: 'refresh', jti: crypto.randomUUID() },
    config.refreshSecret || config.jwtSecret,
    { expiresIn: '30d', issuer: 'patafundi-api', audience: 'patafundi-web' },
  );
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const base = {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
  };
  res.cookie('access_token', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.cookie('csrf_token', csrfToken, {
    sameSite: 'strict',
    secure: config.cookieSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.clearCookie('csrf_token');
}

export function csrfProtection(req, _res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();
  const path = req.path || '';
  if (path.startsWith('/api/auth') || path.startsWith('/auth')) return next();
  if (!req.cookies?.access_token && !req.cookies?.refresh_token) return next();
  const provided = req.get('x-csrf-token');
  const expected = req.cookies?.csrf_token;
  if (!provided || !expected || provided !== expected) return next(forbidden('Invalid CSRF token'));
  return next();
}

export async function optionalAuth(req, _res, next) {
  try {
    requireConfig(config.jwtSecret, 'JWT_SECRET');
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.cookies?.access_token;
    if (!token) return next();
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'patafundi-api',
      audience: 'patafundi-web',
    });
    const result = await query(
      'select id, email, full_name, phone, role, status, trust_score from users where id = $1',
      [payload.sub],
    );
    if (result.rows[0]?.status === 'active') req.user = result.rows[0];
    next();
  } catch {
    next();
  }
}

export async function authRequired(req, _res, next) {
  try {
    requireConfig(config.jwtSecret, 'JWT_SECRET');
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.cookies?.access_token;
    if (!token) throw forbidden('Authentication required');
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'patafundi-api',
      audience: 'patafundi-web',
    });
    const result = await query(
      'select id, email, full_name, phone, role, status, trust_score from users where id = $1',
      [payload.sub],
    );
    if (!result.rows[0]) throw forbidden('User account not found');
    if (result.rows[0].status !== 'active') throw forbidden('Account is not active');
    req.user = result.rows[0];
    next();
  } catch (error) {
    error.status = error.status || 401;
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}
