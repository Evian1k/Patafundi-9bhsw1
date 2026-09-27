/**
 * Country/currency context (master prompt §40 Globalization).
 * Detects the visitor's country once, lets users override it in Settings,
 * and exposes the currency so money rendering follows the region — not a
 * hardcoded KES.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export interface Country {
  code: string;
  name: string;
  currency_code: string;
  currency_symbol?: string;
  phone_code?: string;
  flag_emoji?: string;
  is_active?: boolean;
  default_language?: string;
}

interface CountryContextValue {
  country: Country | null;
  countries: Country[];
  currency: CurrencyCode;
  loading: boolean;
  setCountry: (code: string) => void;
  formatMoney: (amount: number | string | null | undefined, currency?: CurrencyCode) => string;
}

const STORAGE_KEY = "patafundi.country";

const CountryContext = createContext<CountryContextValue>({
  country: null,
  countries: [],
  currency: "KES",
  loading: true,
  setCountry: () => {},
  formatMoney: (a) => formatMoney(a),
});

const FALLBACK_COUNTRIES: Country[] = [
  { code: "KE", name: "Kenya", currency_code: "KES", currency_symbol: "KSh", phone_code: "+254", flag_emoji: "🇰🇪" },
];

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountryState] = useState<Country | null>(null);
  const [countries, setCountries] = useState<Country[]>(FALLBACK_COUNTRIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.request("/global/countries") as { countries?: Country[] };
        if (cancelled) return;
        if (Array.isArray(res.countries) && res.countries.length > 0) setCountries(res.countries);
      } catch {
        // offline / API down — keep fallback list
      }
      // resolved preference (localStorage) wins; else server-side detection; else KE
      const saved = (() => {
        try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
      })();
      if (saved) {
        const match = countries.find((c) => c.code === saved);
        if (match) { setCountryState(match); setLoading(false); return; }
      }
      try {
        const detected = await apiClient.request("/global/detect-country") as { countryCode?: string; country?: Country };
        const code = detected.countryCode || detected.country?.code;
        const match = countries.find((c) => c.code === (saved || code || "KE")) || countries[0];
        if (!cancelled) setCountryState(match || null);
      } catch {
        if (!cancelled) setCountryState(countries.find((c) => c.code === (saved || "KE")) || countries[0] || null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCountry = useCallback((code: string) => {
    const match = countries.find((c) => c.code === code) || null;
    setCountryState(match);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }
    // Persist server-side too (fire-and-forget) when logged in.
    apiClient.request("/users/me", {
      method: "PUT",
      body: { countryCode: code },
    }).catch(() => { /* anonymous visitors just keep the local choice */ });
  }, [countries]);

  const value = useMemo<CountryContextValue>(() => ({
    country,
    countries,
    currency: country?.currency_code || "KES",
    loading,
    setCountry,
    formatMoney: (amount, currency) => formatMoney(amount, currency || country?.currency_code || "KES"),
  }), [country, countries, loading, setCountry]);

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  return useContext(CountryContext);
}
