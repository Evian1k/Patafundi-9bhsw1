/**
 * GPS utility — max accuracy threshold and position helper.
 */

export function getMaxGpsAccuracyMeters(): number {
  const fromEnv = import.meta.env.VITE_MAX_GPS_ACCURACY_METERS;
  const parsed = fromEnv ? Number(fromEnv) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
}

/**
 * Get current GPS position as a promise with sensible defaults.
 */
export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0, ...options }
    );
  });
}

/**
 * Watch position with sensible defaults, returns the watchId.
 */
export function watchPosition(
  onSuccess: PositionCallback,
  onError?: PositionErrorCallback,
  options?: PositionOptions
): number {
  return navigator.geolocation.watchPosition(
    onSuccess,
    onError ?? ((e) => console.warn('[GPS] watchPosition error:', e.message)),
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0, ...options }
  );
}
