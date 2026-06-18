import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config, logProductionConfigWarnings } from './config.js';
import { router } from './routes.js';
import { attachRealtime } from './realtime.js';
import { healthcheck } from './db.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { csrfProtection } from './middleware/auth.js';
import { authRateLimit, otpRateLimit, paymentWebhookRateLimit, mapsRateLimit } from './middleware/rateLimit.js';
import { corsOriginCallback } from './cors.js';
import { isLocalDatabaseUrl } from './pg-config.js';
import { checkCommissionProtection, runPatternDetection } from './services/fraudService.js';

const app = express();
// Trust the first proxy hop (Render's load balancer) so req.ip reflects
// the real client IP. Required for rate-limit keyGenerator and for the
// M-Pesa webhook loopback check to work correctly in production.
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginCallback,
    credentials: true,
  },
});

attachRealtime(io);

app.use(helmet());
app.use(cors({
  origin: corsOriginCallback,
  credentials: true,
}));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));
// Global per-IP rate limit. In development the limit is raised so that
// automated test suites can exercise the full API in a single minute;
// production keeps the conservative 120/min cap.
const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: config.nodeEnv === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalRateLimit);
app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/auth/forgot-password', authRateLimit);
app.use('/api/auth/otp-verify', otpRateLimit);
app.use('/api/auth/otp-resend', otpRateLimit);
app.use('/api/auth/reset-password', otpRateLimit);
app.use('/api/payments/webhook', paymentWebhookRateLimit);
app.use('/api/payments/daraja-callback', paymentWebhookRateLimit);
app.use('/api/maps', mapsRateLimit);
app.use(csrfProtection);

app.get('/', (_req, res) => {
  res.json({
    status: 'API running',
    service: 'patafundi-api',
    health: '/health',
    api: '/api',
  });
});

app.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  const database = await healthcheck().catch((error) => ({
    configured: Boolean(config.databaseUrl),
    ok: false,
    error: error.message,
  }));

  if (config.nodeEnv === 'production' && config.databaseUrl && isLocalDatabaseUrl(config.databaseUrl)) {
    database.ok = false;
    database.error = 'DATABASE_URL points to localhost. Link Render PostgreSQL.';
  }

  // Storage subsystem — R2 client init + bucket env vars present?
  let storage = { configured: false, provider: 'local_fallback' };
  try {
    const { storageStatus } = await import('./services/storageService.js');
    storage = storageStatus();
  } catch { /* storageService not yet loaded — leave default */ }

  // Email (Resend) — API key present?
  const email = {
    configured: Boolean(config.resendApiKey),
    from: config.emailFrom,
  };

  // M-Pesa Daraja — required env vars present?
  const mpesa = {
    configured: Boolean(
      config.mpesa.consumerKey
      && config.mpesa.consumerSecret
      && config.mpesa.shortcode
      && config.mpesa.passkey
      && config.mpesa.callbackUrl,
    ),
    callbackConfigured: Boolean(config.mpesa.callbackUrl),
    callbackSecretConfigured: Boolean(config.mpesa.callbackSecret),
  };

  const ok = database.ok === true;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'healthy' : 'degraded',
    success: ok,
    service: 'patafundi-api',
    build: {
      sha: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
      deployId: process.env.RENDER_DEPLOY_ID || null,
      env: config.nodeEnv,
    },
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    subsystems: {
      database,
      storage,
      email,
      mpesa,
    },
  });
});

// No public /uploads — all files require signed URLs via /api/storage/*

app.use('/api', router);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  let status = error.status || 500;
  let message = error.message || 'Internal server error';

  if (/ECONNREFUSED|connect ECONNREFUSED|Connection terminated|timeout expired|not available/i.test(message)) {
    status = 503;
    message = config.nodeEnv === 'production'
      ? 'Database unavailable. Verify DATABASE_URL on Render (PostgreSQL, not localhost).'
      : 'Database unavailable. Start PostgreSQL or run: npm run dev';
  } else if (/relation .* does not exist/i.test(message)) {
    status = 503;
    message = config.nodeEnv === 'production'
      ? 'Database not initialized. Check Render deploy logs for migration errors.'
      : 'Database not initialized. Run: npm run db:setup';
  } else if (/invalid input syntax for type uuid/i.test(message)) {
    status = 400;
    message = 'Invalid id format';
  } else if (/is not configured/i.test(message)) {
    status = 503;
  }

  if (status >= 500) {
    console.error('[PataFundi API]', message);
  }

  res.status(status).json({ success: false, message });
});

process.on('unhandledRejection', (reason) => {
  console.error('[PataFundi API] unhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PataFundi API] uncaughtException:', error);
});

logProductionConfigWarnings();

try {
  await ensureDevDatabase();
} catch (error) {
  console.error('[PataFundi API] Database bootstrap failed:', error.message);
  if (config.nodeEnv === 'production') {
    console.error('[PataFundi API] Starting anyway — /health will report database status.');
  }
}

const host = config.host || '0.0.0.0';
const port = config.port;

server.listen(port, host, () => {
  console.log(`[PataFundi API] listening on ${host}:${port} (${config.nodeEnv})`);
  const runFraudJobs = async () => {
    try {
      const flagged = await checkCommissionProtection();
      const patterns = await runPatternDetection();
      if (flagged || patterns) console.log(`[fraud] flagged=${flagged} patterns=${patterns}`);
    } catch (err) {
      console.error('[fraud] background job error:', err.message);
    }
  };
  runFraudJobs();
  setInterval(runFraudJobs, 15 * 60 * 1000);
});

server.on('error', (error) => {
  console.error('[PataFundi API] server error:', error.message);
  process.exit(1);
});
