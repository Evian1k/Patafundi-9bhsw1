/**
 * PataFundi environment configuration.
 * API URLs are defined in @/api/config — import from there for new code.
 */

import {
  API_BASE_URL,
  SOCKET_URL,
  isApiConfigured,
} from '@/api/config';

export { API_BASE_URL, SOCKET_URL, buildApiUrl, isApiConfigured } from '@/api/config';

export const env = {
  API_URL: API_BASE_URL,
  SOCKET_URL,
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null,
};

export function validateEnv(): void {
  if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
    console.warn(
      '[PataFundi] VITE_API_URL is not set; production build should use .env.production or platform env vars.',
    );
  }
}
