/**
 * Single source of truth for API connectivity (local proxy vs production Render).
 *
 * Local dev: leave VITE_API_URL empty → uses Vite proxy `/api` → localhost:4000
 * Production: VITE_API_URL=https://patafundi-9bhsw1.onrender.com
 */

export const PRODUCTION_API_ORIGIN = 'https://patafundi-9bhsw1.onrender.com';

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

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
export const SOCKET_URL = resolveSocketBaseUrl(API_BASE_URL, import.meta.env.VITE_SOCKET_URL);
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
