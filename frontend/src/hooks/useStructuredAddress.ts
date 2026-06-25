import { useEffect, useState } from 'react';
import { resolveStructuredAddress, LOCATION_FALLBACK } from '@/lib/maps/geocoding';
import type { Coordinates, StructuredAddress } from '@/lib/maps/types';

export function useStructuredAddress(coords: Coordinates | null, fallbackLabel = '') {
  const [address, setAddress] = useState<StructuredAddress | null>(
    fallbackLabel ? { fullLabel: fallbackLabel, shortLabel: fallbackLabel, displayLines: [fallbackLabel] } : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    resolveStructuredAddress(coords.latitude, coords.longitude)
      .then((resolved) => {
        if (!cancelled) setAddress(resolved);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [coords?.latitude, coords?.longitude]);

  return { address, loading };
}
