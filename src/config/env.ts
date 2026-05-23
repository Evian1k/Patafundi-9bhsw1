/**
 * Centralized environment configuration.
 * NEVER throws fatal errors — logs warnings only.
 * NEVER exposes raw env var names in user-facing UI.
 */

export const env = {
  API_URL: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '',
  SOCKET_URL: (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? '',
  GOOGLE_MAPS_API_KEY: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '',
  MAX_GPS_ACCURACY_METERS: Number(import.meta.env.VITE_MAX_GPS_ACCURACY_METERS ?? 200),
} as const;

export const isApiConfigured = () => Boolean(env.API_URL);
export const isSocketConfigured = () => Boolean(env.SOCKET_URL);
export const isMapsConfigured = () => Boolean(env.GOOGLE_MAPS_API_KEY);

/** Logs warnings at startup. Never throws. */
export function validateEnv() {
  if (!env.API_URL) {
    console.warn(
      '[PataFundi] Backend API not configured.\n' +
      'The app will run in demo mode until VITE_API_URL is set.\n' +
      'Docs: https://github.com/Evian1k/patafundifullversion'
    );
  }
  if (!env.SOCKET_URL) {
    console.warn('[PataFundi] Real-time features require VITE_SOCKET_URL to be configured.');
  }
}
