import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { decodePolyline } from '@/lib/maps/polyline';
import type { Coordinates, DirectionsResult } from '@/lib/maps/types';

export function useDirections(
  origin: Coordinates | null,
  destination: Coordinates | null,
  enabled = true,
) {
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [routePath, setRoutePath] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !origin || !destination) {
      setDirections(null);
      setRoutePath([]);
      return;
    }

    let cancelled = false;
    const fetchDirections = async () => {
      setLoading(true);
      try {
        const data = await apiClient.getDirections(origin, destination) as DirectionsResult & { success?: boolean };
        if (cancelled) return;
        setDirections(data);
        if (data.polyline) {
          setRoutePath(decodePolyline(data.polyline));
        } else {
          setRoutePath([origin, destination]);
        }
      } catch {
        if (!cancelled) {
          setDirections(null);
          setRoutePath(origin && destination ? [origin, destination] : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDirections();
    const interval = setInterval(fetchDirections, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    enabled,
    origin?.latitude,
    origin?.longitude,
    destination?.latitude,
    destination?.longitude,
  ]);

  return { directions, routePath, loading };
}
