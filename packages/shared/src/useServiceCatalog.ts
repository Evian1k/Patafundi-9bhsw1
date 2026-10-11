import { useCallback, useEffect, useState } from 'react';
import apiClient from './apiClient';
import type { ServiceCategory } from './types';

const DEFAULT_COUNTRY = (process.env.EXPO_PUBLIC_COUNTRY_CODE || 'KE').toUpperCase();

export function useServiceCatalog(countryCode = DEFAULT_COUNTRY, search = '') {
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiClient.getServiceCategories(countryCode, search)
        .then((response) => {
          if (!active) return;
          setServices(response.services || []);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof Error ? cause.message : 'Service catalog is temporarily unavailable.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, search.trim() ? 250 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [countryCode, search, attempt]);

  return { services, loading, error, retry };
}
