import dotenv from 'dotenv';
import { isLocalDatabaseUrl } from './pg-config.js';

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// Never load committed .env on Render — it often contains localhost DATABASE_URL.
if (!isProduction) {
  dotenv.config();
}

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.MONGO_URI || '';
  if (isProduction && isLocalDatabaseUrl(url)) {
    console.error(
      '[PataFundi API] Ignoring localhost DATABASE_URL in production. '
      + 'Set DATABASE_URL from a linked Render PostgreSQL instance.',
    );
    return '';
  }
  return url;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  frontendOrigin: process.env.FRONTEND_ORIGIN
    || (isProduction ? 'https://patafundi.vercel.app' : 'http://127.0.0.1:8080'),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: resolveDatabaseUrl(),
  jwtSecret: process.env.JWT_SECRET || '',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true' || isProduction,
  mpesa: {
    baseUrl: process.env.MPESA_BASE_URL || 'https://api.safaricom.co.ke',
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || '',
    callbackSecret: process.env.MPESA_CALLBACK_SECRET || '',
    timeoutUrl: process.env.MPESA_TIMEOUT_URL || '',
    resultUrl: process.env.MPESA_RESULT_URL || '',
  },
};

export function requireConfig(value, name) {
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.status = 503;
    throw error;
  }
  return value;
}

export function logProductionConfigWarnings() {
  if (!isProduction) return;

  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (missing.length) {
    console.error(`[PataFundi API] Missing required production env: ${missing.join(', ')}`);
  }
}
