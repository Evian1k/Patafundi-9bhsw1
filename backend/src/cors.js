import { config } from './config.js';

const LOCAL_ORIGINS = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

/**
 * Vercel preview deployments for THIS project only.
 * Allows any of these formats:
 *   - patafundi.vercel.app                          (legacy personal project)
 *   - patafundi-<hash>.vercel.app                   (personal project with branch/commit hash)
 *   - patafundi-<slug>-<hash>-<team>.vercel.app     (team project — multiple hyphenated segments)
 *
 * The regex requires the hostname to START with "patafundi" so arbitrary
 * *.vercel.app deployments (which anyone can create) are NOT allowed.
 */
const VERCEL_PREVIEW_RE = /^https:\/\/([a-z0-9-]+\.)?patafundi(-[a-z0-9-]+)*\.vercel\.app$/i;

const PRODUCTION_ORIGINS = [
  'https://patafundi.vercel.app',
  'https://patafundi-9bhsw1.vercel.app',
  'https://patafundi-9bhsw1-6emkangdl-evian1ks-projects.vercel.app',
];

export function getAllowedOrigins() {
  return new Set(
    [config.frontendOrigin, ...PRODUCTION_ORIGINS, ...LOCAL_ORIGINS, ...config.corsOrigins].filter(Boolean),
  );
}

export function isOriginAllowed(origin) {
  // Missing Origin header: same-origin browser request or non-browser client (curl).
  // Browsers ALWAYS set Origin on credentialed cross-site requests, so this is safe.
  if (!origin) return true;
  if (getAllowedOrigins().has(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

export function corsOriginCallback(origin, callback) {
  if (isOriginAllowed(origin)) return callback(null, true);
  return callback(new Error(`Not allowed by CORS: ${origin}`));
}
