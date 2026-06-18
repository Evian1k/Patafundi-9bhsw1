/**
 * Single source of truth for API connectivity.
 *
 * Local dev: leave VITE_API_URL empty → Vite proxy `/api` → localhost:4000
 * Production: uses VITE_API_URL, or defaults to Render backend (never relative /api on Vercel)
 */

export const PRODUCTION_API_ORIGIN = 'https://patafundi-9bhsw1.onrender.com';

function readEnvApiUrl(): string {
  const raw =
    import.meta.env.VITE_API_URL ??
    import.meta.env.REACT_APP_API_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  // Production builds must never use relative /api (hits Vercel, not Render)
  if (import.meta.env.PROD) return PRODUCTION_API_ORIGIN;
  return '';
}

/** Normalize to an API base that always ends with `/api` for remote hosts. */
export function normalizeApiBaseUrl(raw?: string): string {
  const value = (raw ?? '').trim();
  if (!value) return '/api';
  const base = value.replace(/\/$/, '');
  if (base === '/api' || base.endsWith('/api')) return base;
  if (/^https?:\/\//i.test(base)) return `${base}/api`;
  return base;
}

export function resolveSocketBaseUrl(apiBase: string, explicitSocket?: string): string | null {
  if (explicitSocket?.trim()) return explicitSocket.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(apiBase)) return apiBase.replace(/\/api\/?$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return null;
}

function readSocketEnv(): string | undefined {
  const raw =
    import.meta.env.VITE_SOCKET_URL ??
    import.meta.env.REACT_APP_SOCKET_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (import.meta.env.PROD) return PRODUCTION_API_ORIGIN;
  return undefined;
}

export const API_BASE_URL = normalizeApiBaseUrl(readEnvApiUrl());
export const SOCKET_URL = resolveSocketBaseUrl(API_BASE_URL, readSocketEnv());
export const IS_REMOTE_API = API_BASE_URL.startsWith('http');

/** Build full URL for an API path (e.g. `/auth/login` → `…/api/auth/login`). */
export function buildApiUrl(endpoint: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (base.endsWith('/api') && path.startsWith('/api/')) {
    return `${base}${path.slice(4)}`;
  }
  return `${base}${path}`;
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}
