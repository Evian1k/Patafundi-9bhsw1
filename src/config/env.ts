/**
 * PataFundi environment configuration.
 *
 * Production deployments must provide a PataFundi-owned API origin. The app no
 * longer falls back to any vendor-hosted backend.
 */

const DEFAULT_API_BASE = '/api';

function resolveSocketUrl(): string | null {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return null;
}

export const env = {
  API_URL: import.meta.env.VITE_API_URL || DEFAULT_API_BASE,
  SOCKET_URL: resolveSocketUrl(),
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null,
};

export function isApiConfigured(): boolean {
  return Boolean(env.API_URL);
}

export function validateEnv(): void {
  if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
    console.warn('[PataFundi] VITE_API_URL is not configured; using same-origin /api');
  }
}
