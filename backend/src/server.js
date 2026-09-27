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
import { healthcheck, query } from './db.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { csrfProtection } from './middleware/auth.js';
import { authRateLimit, otpRateLimit, paymentWebhookRateLimit, mapsRateLimit } from './middleware/rateLimit.js';
import { corsOriginCallback } from './cors.js';
import { isLocalDatabaseUrl } from './pg-config.js';
import { logNonFatal, swallow } from './utils/logError.js';
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
  // ── DoS protection ────────────────────────────────────────────────
  maxHttpBufferSize: 1e6, // 1MB max per message (prevents memory exhaustion)
  pingTimeout: 30000, // close connection if no ping response in 30s
  pingInterval: 25000, // ping every 25s to keep connection alive
  connectTimeout: 10000, // 10s to establish connection
  // connection rate limiting
  // (handled in io.use middleware — reject if IP has too many connections)
});

attachRealtime(io);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://maps.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://maps.googleapis.com', 'https://*.tile.openstreetmap.org', 'https://*.cloudflarestorage.com'],
      connectSrc: ["'self'", 'https://api.safaricom.co.ke', 'https://maps.googleapis.com', 'wss:', 'ws:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: {
    policy: { geolocation: ["'self'"], camera: ["'self'"], microphone: ["'none'"] },
  },
}));
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

// Maintenance mode — blocks customer/fundi access when enabled, allows staff
import { maintenanceCheck } from './middleware/maintenanceMode.js';
app.use(maintenanceCheck);

app.get('/', (_req, res) => {
  res.json({
    status: 'API running',
    service: 'patafundi-api',
    health: '/health',
    ready: '/ready',
    api: '/api',
  });
});

// Readiness probe (spec §35): cheap check that the process can serve traffic —
// DB reachable. Used by Docker health checks and future orchestrators.
app.get('/ready', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ status: 'ready', service: 'patafundi-api' });
  } catch {
    res.status(503).json({ status: 'not_ready', service: 'patafundi-api' });
  }
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
  } catch (error) {
    logNonFatal('health.storageStatus', error);
  }

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

// ── Error classification → user-safe message mapping ────────────────
// Users (customers, fundis, company staff) must NEVER see raw technical
// errors (SQL fragments, stack hints, internal paths, provider details).
// Every failure gets: a friendly message + a short reference code they can
// quote to support. The full raw detail is logged server-side and routed
// to the staff role responsible (see errorNotificationService.js).
const USER_SAFE_MESSAGES = {
  database: 'We are having trouble reaching our services right now. Please try again in a moment.',
  system: 'Something went wrong on our side. Our team has been notified and is on it.',
  payment: 'We could not complete your payment request. No money has left your account. Please try again or contact support.',
  security: 'You do not have permission to perform this action.',
  rate_limit: 'Too many requests. Please wait a moment and try again.',
  fraud: 'This request could not be completed. If you believe this is a mistake, contact support.',
  client: 'Something went wrong while displaying this page. Our team has been notified.',
  general: 'Something went wrong. Please try again.',
};

function classifyError(error) {
  const message = error.message || '';
  let status = error.status || 500;
  let type = 'general';

  // Database-related errors → 503 (service unavailable), not 500.
  if (
    /ECONNREFUSED|connect ECONNREFUSED|Connection terminated|timeout expired|not available/i.test(message)
    || /ENOTFOUND|ETIMEDOUT|EHOSTUNREACH/i.test(message)
    || /PGlite failed|Aborted\(\)|embedded.*failed/i.test(message)
    || /Database unavailable|database.*unreachable/i.test(message)
    || /relation .* does not exist/i.test(message)
  ) {
    status = 503;
    type = 'database';
  } else if (/invalid input syntax for type uuid/i.test(message)) {
    status = 400;
    return { status, type: 'general', userMessage: 'Invalid request. Please check and try again.' };
  } else if (/is not configured/i.test(message)) {
    status = 503;
    type = 'system';
  } else if (/payment|mpesa|stk.push|daraja/i.test(message)) {
    type = 'payment';
  } else if (/rate limit|too many/i.test(message)) {
    type = 'rate_limit';
  } else if (/fraud|suspicious|blocked/i.test(message)) {
    type = 'fraud';
  } else if (status === 401 || status === 403) {
    type = 'security';
  } else if (status >= 500) {
    type = 'system';
  }

  return { status, type, userMessage: USER_SAFE_MESSAGES[type] || USER_SAFE_MESSAGES.general };
}

function makeErrorReference() {
  // Short, human-quotable reference, e.g. ERR-7F3K2Q. Avoids ambiguous chars.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `ERR-${code}`;
}

app.use((error, _req, res, _next) => {
  const { status, type, userMessage } = classifyError(error);
  const reference = makeErrorReference();
  const isClientError = status >= 400 && status < 500;

  // 4xx messages are intentional, human-written validation messages from
  // controllers (e.g. "Invalid credentials", "Job not found") — safe to show.
  // 5xx and infrastructure failures always get the sanitized message.
  const message = isClientError
    ? (error.userSafeMessage || error.message || userMessage)
    : userMessage;

  if (status >= 500) {
    console.error(`[PataFundi API] ${reference} (${type})`, error.message);
  }

  // ── Route the full technical detail to the responsible staff role ──
  // Logs to error_logs (with reference) + notifies the right team.
  // Non-blocking — never let this crash the request.
  import('./services/errorNotificationService.js')
    .then(({ logErrorAndNotifyStaff }) => {
      return logErrorAndNotifyStaff({
        type,
        statusCode: status,
        message: error.message,
        stack: error.stack,
        reference,
        path: _req.path,
        method: _req.method,
        userId: _req.user?.id || null,
        userRole: _req.user?.role || null,
        ip: _req.ip,
        userAgent: _req.get('User-Agent'),
      });
    })
    .catch(swallow('errorHandler.notifyStaff', { path: _req.path, status, reference }));

  // In development, include the raw message so the developer console/debug
  // flows still work. In production this field is NEVER sent.
  const payload = { success: false, message, reference };
  if (config.nodeEnv !== 'production' && status >= 500) {
    payload.debug = { type, rawMessage: error.message };
  }
  res.status(status).json(payload);
});

process.on('unhandledRejection', (reason) => {
  console.error('[PataFundi API] unhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PataFundi API] uncaughtException:', error);
});

logProductionConfigWarnings();

// ── Startup banner: print DB status so developers know exactly what's happening ──
const dbUrlSet = Boolean(config.databaseUrl);
const dbUrlSource = dbUrlSet ? (config.databaseUrl.includes('localhost') ? 'local' : config.databaseUrl.includes('neon') ? 'Neon' : config.databaseUrl.includes('supabase') ? 'Supabase' : 'cloud') : 'none';
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  PataFundi API — starting...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Environment:    ${config.nodeEnv}`);
console.log(`  DATABASE_URL:   ${dbUrlSet ? `set (${dbUrlSource})` : 'NOT SET — will use PGlite embedded DB'}`);
if (!dbUrlSet && config.nodeEnv !== 'production') {
  console.log('');
  console.log('  ⚠️  No DATABASE_URL found. The server will try PGlite (embedded Postgres).');
  console.log('     If PGlite crashes on your machine, get a FREE cloud Postgres:');
  console.log('     → https://neon.tech  (30 seconds, no credit card)');
  console.log('     Then put DATABASE_URL=postgresql://... in your .env file.');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

try {
  await ensureDevDatabase();
} catch (error) {
  console.error('[PataFundi API] Database bootstrap failed:', error.message);
  if (config.nodeEnv === 'production') {
    console.error('[PataFundi API] Starting anyway — /health will report database status.');
  }
}

// Dev-only: seed the full takeover demo ecosystem (company, jobs, wallets,
// @patafundi.test accounts) so `npm run dev` works out of the box — Quick
// Login on /demo needs these accounts. Idempotent upserts; refuses in prod.
if (config.nodeEnv !== 'production') {
  try {
    const { seedTakeover } = await import('../scripts/seed-takeover.js');
    await seedTakeover();
  } catch (error) {
    console.warn('[PataFundi API] Demo ecosystem seed skipped:', error.message);
  }
}

// Webhook authenticity (spec §payments): in production M-Pesa callbacks MUST
// carry the shared callback secret. Fail fast at boot when it is missing
// instead of silently relying on signature verification only.
try {
  const { requireCallbackSecretInProduction } = await import('./services/mpesaService.js');
  requireCallbackSecretInProduction();
} catch (error) {
  console.error('[PataFundi API] M-Pesa webhook configuration error:', error.message);
  if (config.nodeEnv === 'production') process.exit(1);
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

  // Scheduled job scheduler — activates scheduled jobs when their time arrives
  const runScheduledJobs = async () => {
    try {
      const { query } = await import('./db.js');
      const due = await query(
        `update jobs set status = 'matching' where status = 'scheduled' and scheduled_at <= now() returning id, customer_id`,
      );
      if (due.rows.length > 0) {
        console.log(`[scheduler] Activated ${due.rows.length} scheduled job(s)`);
        for (const job of due.rows) {
          const { emitEvent } = await import('./realtime.js');
          emitEvent('job:status', { jobId: job.id, status: 'matching' }, `job:${job.id}`);
          emitEvent('job:created', { jobId: job.id, status: 'matching' }, `user:${job.customer_id}`);
        }
      }
    } catch (err) {
      console.error('[scheduler] error:', err.message);
    }
  };
  runScheduledJobs();
  setInterval(runScheduledJobs, 60 * 1000); // check every minute

  // ── Job expiry reaper (spec §17 failure states) ──────────────────
  // Offers not answered within 5 minutes return to matching so another
  // provider can take the job; requests unmatched after 24h expire.
  const runJobExpiry = async () => {
    try {
      const { query } = await import('./db.js');
      const { emitEvent } = await import('./realtime.js');
      const requeued = await query(
        `update jobs set status = 'matching', updated_at = now()
         where status = 'offered' and updated_at < now() - interval '5 minutes'
         returning id, customer_id`,
      );
      for (const job of requeued.rows) {
        emitEvent('job:status', { jobId: job.id, status: 'matching', reason: 'offer_expired' }, `job:${job.id}`);
      }
      const expired = await query(
        `update jobs set status = 'expired', updated_at = now()
         where status in ('pending', 'matching')
           and created_at < now() - interval '24 hours'
         returning id, customer_id`,
      );
      for (const job of expired.rows) {
        await query(
          `insert into notifications (user_id, type, title, body, data)
           values ($1, 'job_expired', 'Request expired', 'No provider accepted your request within 24 hours. You can book again any time.', $2::jsonb)`,
          [job.customer_id, JSON.stringify({ jobId: job.id })],
        );
        emitEvent('job:status', { jobId: job.id, status: 'expired' }, `job:${job.id}`);
      }
      if (requeued.rows.length || expired.rows.length) {
        console.log(`[expiry] requeued=${requeued.rows.length} expired=${expired.rows.length}`);
      }
    } catch (err) {
      console.error('[expiry] error:', err.message);
    }
  };
  runJobExpiry();
  setInterval(runJobExpiry, 60 * 1000);

  // ── Scheduled maintenance checker ─────────────────────────────────
  // Runs every minute to check if the current time falls within a
  // scheduled maintenance window (default: Wednesday 2-4 AM EAT).
  // Auto-toggles the maintenance_mode feature flag.
  import('./services/scheduledMaintenanceService.js')
    .then(({ runScheduledMaintenanceCheck }) => {
      runScheduledMaintenanceCheck();
      setInterval(runScheduledMaintenanceCheck, 60 * 1000);
      console.log('[maintenance] scheduled maintenance checker started (default: Wednesday 2-4 AM EAT)');
    })
    .catch((err) => {
      console.warn('[maintenance] could not start scheduler:', err.message);
    });

  // ── Data retention cleanup ───────────────────────────────────────
  // Runs daily to clean up expired data per Data Retention Policy
  import('./services/dataRetentionService.js')
    .then(({ runDataRetentionCleanup }) => {
      // Run cleanup after 5 minutes of startup, then every 24 hours
      setTimeout(() => runDataRetentionCleanup(), 5 * 60 * 1000);
      setInterval(runDataRetentionCleanup, 24 * 60 * 60 * 1000);
      console.log('[retention] data retention cleanup scheduled (daily)');
    })
    .catch((err) => {
      console.warn('[retention] could not schedule data retention cleanup:', err.message);
    });

  // ── Queue worker (in-process, PostgreSQL-backed) ────────────────
  // Processes background jobs: image moderation, push notifications,
  // payout processing, etc. Uses FOR UPDATE SKIP LOCKED so multiple
  // worker instances can run concurrently without double-processing.
  import('./queueWorker.js')
    .then(({ startQueueWorker, registerQueueHandler }) => {
      // Handler: send push notifications queued from controllers
      registerQueueHandler('push_notification', async (payload) => {
        const { sendPushNotification } = await import('./services/pushService.js');
        await sendPushNotification(payload);
      });

      // Handler: send OTP emails via Resend
      registerQueueHandler('email_otp', async (payload) => {
        const { sendOtpEmail } = await import('./services/emailService.js');
        await sendOtpEmail(payload);
      });

      // Handler: send fraud warning emails
      registerQueueHandler('email_fraud', async (payload) => {
        const { sendFraudWarningEmail } = await import('./services/emailService.js');
        await sendFraudWarningEmail(payload);
      });

      // Handler: generic notification emails (central notification service §27)
      registerQueueHandler('email_notification', async (payload) => {
        const { query } = await import('./db.js');
        const { sendNotificationEmail } = await import('./services/emailService.js');
        const user = await query('select email from users where id = $1', [payload.userId]);
        if (!user.rows[0]?.email) return;
        await sendNotificationEmail({
          to: user.rows[0].email,
          subject: payload.title,
          title: payload.title,
          body: payload.body,
        });
      });

      // Handler: SMS notifications (central notification service §27) —
      // sends only when an SMS provider is configured (see smsService status).
      registerQueueHandler('sms_notification', async (payload) => {
        const { query } = await import('./db.js');
        const { sendSms } = await import('./services/smsService.js');
        const user = await query('select phone from users where id = $1', [payload.userId]);
        if (!user.rows[0]?.phone) return;
        await sendSms({ to: user.rows[0].phone, message: `${payload.title}\n${payload.body || ''}`.slice(0, 320) });
      });

      startQueueWorker();
      console.log('[queue] background worker started (polls every 5s)');
    })
    .catch((err) => {
      console.warn('[queue] could not start worker:', err.message);
    });
});

server.on('error', (error) => {
  console.error('[PataFundi API] server error:', error.message);
  process.exit(1);
});
