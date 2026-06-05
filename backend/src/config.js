import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:8080',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
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
