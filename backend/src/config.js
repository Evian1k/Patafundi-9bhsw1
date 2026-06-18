import dotenv from 'dotenv';
import { isLocalDatabaseUrl } from './pg-config.js';

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// Never load committed .env on Render — it often contains localhost DATABASE_URL.
if (!isProduction) {
  // override: true so .env values take precedence over any inherited env vars
  // (e.g. a stale DATABASE_URL=file:... from the parent process).
  dotenv.config({ override: true });
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
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'onboarding@resend.dev',
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
  storage: {
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2Bucket: process.env.R2_BUCKET_NAME || 'patafundi',
    r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    rekognitionEnabled: process.env.AWS_REKOGNITION_ENABLED === 'true',
  },
};

export function requireConfig(value, name) {
  if (!value) {
    const hint = name === 'JWT_SECRET' || name === 'REFRESH_TOKEN_SECRET'
      ? `${name} is not configured. Create a .env file in the project root with:\n  ${name}=any-random-string-at-least-32-characters-long\nSee .env.example for the full list of required variables.`
      : `${name} is not configured. See .env.example for details.`;
    const error = new Error(hint);
    error.status = 503;
    throw error;
  }
  return value;
}

export function logProductionConfigWarnings() {
  // Run in both dev and production so developers see missing config early.
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.refreshSecret) missing.push('REFRESH_TOKEN_SECRET');
  if (missing.length) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('  ⚠️  MISSING REQUIRED ENVIRONMENT VARIABLES');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`  Missing: ${missing.join(', ')}`);
    console.error('');
    console.error('  Fix: Create a .env file in the project root with these variables.');
    console.error('  See .env.example for the full template.');
    console.error('');
    if (missing.includes('DATABASE_URL')) {
      console.error('  DATABASE_URL: Get a free cloud Postgres from https://neon.tech');
      console.error('    (30 seconds, no credit card, works on Windows/Mac/Linux)');
    }
    if (missing.includes('JWT_SECRET') || missing.includes('REFRESH_TOKEN_SECRET')) {
      console.error('  JWT_SECRET / REFRESH_TOKEN_SECRET: Any random string 32+ characters.');
      console.error('    Example: JWT_SECRET=my-dev-secret-32-chars-minimum-xxxxx');
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
  }
}
