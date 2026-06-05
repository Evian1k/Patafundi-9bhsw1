import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { router } from './routes.js';
import { attachRealtime } from './realtime.js';
import { healthcheck } from './db.js';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: config.frontendOrigin,
    credentials: true,
  },
});

attachRealtime(io);

app.use(helmet());
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/health', async (_req, res) => {
  const database = await healthcheck().catch((error) => ({ configured: Boolean(config.databaseUrl), ok: false, error: error.message }));
  res.json({ success: true, service: 'patafundi-api', database });
});

app.use('/api', router);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  let status = error.status || 500;
  let message = error.message || 'Internal server error';

  if (/ECONNREFUSED.*5432|connect ECONNREFUSED/i.test(message)) {
    status = 503;
    message = 'Database unavailable. Restart the backend with: npm run dev:full';
  } else if (/relation .* does not exist/i.test(message)) {
    status = 503;
    message = 'Database not initialized. Run: npm run db:setup';
  }

  res.status(status).json({
    success: false,
    message,
    meta: config.nodeEnv === 'production' ? undefined : error.meta,
  });
});

await ensureDevDatabase().catch((error) => {
  console.error('[PataFundi API] Database bootstrap failed:', error.message);
});

server.listen(config.port, () => {
  console.log(`[PataFundi API] listening on http://127.0.0.1:${config.port}`);
});
