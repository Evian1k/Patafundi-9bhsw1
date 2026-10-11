import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import type { ServiceCategory } from "@/config/services";

interface CatalogResponse {
  services?: ServiceCategory[];
}

export function useServiceCatalog(countryCode = "KE", search = "") {
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setServices([]);
    apiClient.getServiceCategories(countryCode, search)
      .then((response) => {
        if (active) setServices((response as CatalogResponse).services || []);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Service catalog is temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [countryCode, search, attempt]);

  return { services, loading, error, retry };
}
