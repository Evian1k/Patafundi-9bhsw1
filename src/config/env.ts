/**
 * PataFundi — Environment Configuration
 * Points to OnSpace Cloud Edge Functions
 */

const ONSPACE_BASE = 'https://rootjhvyvhrdummdroot.backend.onspace.ai/functions/v1';

export const env = {
  API_URL: import.meta.env.VITE_API_URL || ONSPACE_BASE,
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || null, // No socket — we use polling
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null,
};

export function isApiConfigured(): boolean {
  return Boolean(env.API_URL);
}

export function validateEnv(): void {
  if (!env.API_URL) {
    console.warn('[PataFundi] API URL not configured — using OnSpace Cloud default');
  }
  if (!env.GOOGLE_MAPS_API_KEY) {
    console.info('[PataFundi] Google Maps key not set — location features use text input');
  }
}
