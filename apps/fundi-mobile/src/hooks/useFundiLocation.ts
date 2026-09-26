import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { apiClient } from '@patafundi/shared';

export function useFundiLocation({ enabled, jobId }: { enabled: boolean; jobId?: string }): void {
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastEmit = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        subRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 10 },
          async (loc) => {
            const now = Date.now();
            if (now - lastEmit.current < 10000) return;
            lastEmit.current = now;
            const { latitude, longitude, accuracy } = loc.coords;
            await apiClient.updateLocation(latitude, longitude, accuracy ?? undefined, jobId).catch(() => undefined);
            if (jobId) apiClient.emitLocationUpdate(jobId, latitude, longitude, accuracy ?? undefined);
          },
        );
      } catch {
        // ignore location errors
      }
    })();
    return () => {
      cancelled = true;
      void cancelled;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [enabled, jobId]);
}
