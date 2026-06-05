import { config } from './config.js';

const LOCAL_ORIGINS = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

/** Vercel production + preview deployments */
const VERCEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;

export function getAllowedOrigins() {
  return new Set(
    [config.frontendOrigin, ...LOCAL_ORIGINS, ...config.corsOrigins].filter(Boolean),
  );
}

export function isOriginAllowed(origin) {
  if (!origin) return true;
  if (getAllowedOrigins().has(origin)) return true;
  if (VERCEL_ORIGIN_RE.test(origin)) return true;
  return false;
}

export function corsOriginCallback(origin, callback) {
  if (isOriginAllowed(origin)) return callback(null, true);
  return callback(new Error(`Not allowed by CORS: ${origin}`));
}
