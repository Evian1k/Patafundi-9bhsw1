import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader, MapPin, Navigation2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { useGoogleMapsReady } from '@/components/maps/GoogleMapsProvider';
import { env } from '@/config/env';
import { geocoderResultToSelection, parseAddressComponents, placeResultToSelection } from '@/lib/maps/parseGooglePlace';
import { formatAddressLines } from '@/lib/maps/geocoding';
import type { StructuredAddress } from '@/lib/maps/types';

export interface LocationSelection {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  address?: StructuredAddress;
  placeId?: string;
  source: 'places' | 'gps' | 'manual' | 'server';
}

interface LocationPickerProps {
  value?: LocationSelection | null;
  onChange: (selection: LocationSelection | null) => void;
  placeholder?: string;
  className?: string;
  showUseCurrentLocation?: boolean;
}

interface Prediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

const DEBOUNCE_MS = 280;

export default function LocationPicker({
  value,
  onChange,
  placeholder = 'Search for a street, building, or area…',
  className = '',
  showUseCurrentLocation = true,
}: LocationPickerProps) {
  const { isLoaded, hasApiKey, useGoogleMaps } = useGoogleMapsReady();
  const [query, setQuery] = useState(value?.formattedAddress || '');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverCacheRef = useRef<Map<string, { lat: string; lon: string; display_name: string; address?: StructuredAddress }>>(new Map());

  const mapsReady = useGoogleMaps && isLoaded && hasApiKey && typeof google !== 'undefined';

  useEffect(() => {
    if (value?.formattedAddress) setQuery(value.formattedAddress);
  }, [value?.formattedAddress]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const newSessionToken = useCallback(() => {
    if (!mapsReady) return null;
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    return sessionTokenRef.current;
  }, [mapsReady]);

  const fetchServerSuggestions = useCallback(async (input: string): Promise<Prediction[]> => {
    const data = await apiClient.searchLocations(input) as {
      results?: Array<{ lat: string; lon: string; display_name: string; address?: StructuredAddress }>;
    };
    return (data.results || []).map((r, idx) => {
      const placeId = `server-${idx}-${r.lat}-${r.lon}`;
      serverCacheRef.current.set(placeId, r);
      return {
        placeId,
        mainText: r.address?.street || r.address?.building || r.display_name.split(',')[0]?.trim() || r.display_name,
        secondaryText: r.address
          ? formatAddressLines(r.address).slice(1).join(', ') || r.display_name
          : r.display_name,
      };
    });
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      if (mapsReady) {
        try {
          const service = new google.maps.places.AutocompleteService();
          const token = sessionTokenRef.current || newSessionToken();
          const response = await new Promise<google.maps.places.AutocompletePrediction[]>((resolve) => {
            service.getPlacePredictions(
              {
                input: trimmed,
                sessionToken: token || undefined,
              },
              (results) => resolve(results || []),
            );
          });
          const mapped = response.map((p) => ({
            placeId: p.place_id,
            mainText: p.structured_formatting.main_text,
            secondaryText: p.structured_formatting.secondary_text || '',
          }));
          if (mapped.length) {
            setPredictions(mapped);
            setIsOpen(true);
            setActiveIndex(-1);
            return;
          }
        } catch {
          // Fall through to free server search (OpenStreetMap).
        }
      }

      const serverResults = await fetchServerSuggestions(trimmed);
      setPredictions(serverResults);
      setIsOpen(serverResults.length > 0);
      if (!mapsReady) setManualMode(true);
    } catch {
      setPredictions([]);
      setManualMode(true);
    } finally {
      setSearching(false);
    }
  }, [mapsReady, newSessionToken, fetchServerSuggestions]);

  const applySelection = useCallback((selection: LocationSelection) => {
    onChange(selection);
    setQuery(selection.formattedAddress);
    setPredictions([]);
    setIsOpen(false);
    setManualMode(false);
    setError(null);
    sessionTokenRef.current = null;
  }, [onChange]);

  const resolvePlaceId = useCallback(async (placeId: string, label: string) => {
    if (!mapsReady || placeId.startsWith('server-')) {
      setResolving(true);
      try {
        let cached = serverCacheRef.current.get(placeId);
        if (!cached) {
          await fetchServerSuggestions(label);
          cached = serverCacheRef.current.get(placeId);
        }
        if (!cached) throw new Error('No results');
        const lat = parseFloat(cached.lat);
        const lng = parseFloat(cached.lon);
        applySelection({
          formattedAddress: cached.display_name,
          latitude: lat,
          longitude: lng,
          address: cached.address,
          source: 'server',
        });
      } catch {
        setError('Could not resolve this address. Try another suggestion or enter manually.');
      } finally {
        setResolving(false);
      }
      return;
    }

    setResolving(true);
    try {
      const div = document.createElement('div');
      const service = new google.maps.places.PlacesService(div);
      const token = sessionTokenRef.current;
      const place = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
        service.getDetails(
          {
            placeId,
            fields: ['formatted_address', 'geometry', 'address_components', 'name', 'place_id'],
            sessionToken: token || undefined,
          },
          (result, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && result) resolve(result);
            else reject(new Error(status));
          },
        );
      });
      const parsed = placeResultToSelection(place);
      if (!parsed) throw new Error('Missing coordinates');
      applySelection({ ...parsed, source: 'places' });
    } catch {
      try {
        await fetchServerSuggestions(label);
        const cached = [...serverCacheRef.current.entries()].find(([id]) => id.startsWith('server-'))?.[1];
        if (cached) {
          applySelection({
            formattedAddress: cached.display_name,
            latitude: parseFloat(cached.lat),
            longitude: parseFloat(cached.lon),
            address: cached.address,
            source: 'server',
          });
          return;
        }
      } catch {
        // Ignore and show manual entry prompt below.
      }
      setError('Could not load place details. Try again or enter your address manually.');
      setManualMode(true);
    } finally {
      setResolving(false);
    }
  }, [mapsReady, applySelection, fetchServerSuggestions]);

  const reverseGeocodeCoords = useCallback(async (latitude: number, longitude: number): Promise<LocationSelection | null> => {
    if (mapsReady) {
      try {
        const geocoder = new google.maps.Geocoder();
        const response = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            if (status === 'OK' && results?.length) resolve(results);
            else reject(new Error(status));
          });
        });
        const parsed = geocoderResultToSelection(response[0]);
        if (parsed) return { ...parsed, source: 'gps' };
      } catch {
        // Fall through to free server geocoding (OpenStreetMap).
      }
    }

    const data = await apiClient.reverseGeocode(latitude, longitude) as {
      address?: StructuredAddress;
      formattedAddress?: string;
      areaName?: string;
    };
    const formattedAddress = data.formattedAddress || data.address?.fullLabel || data.areaName || '';
    if (!formattedAddress) {
      return null;
    }
    return {
      formattedAddress,
      latitude,
      longitude,
      address: data.address,
      source: 'server',
    };
  }, [mapsReady]);

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }
    setGeoLoading(true);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude } = position.coords;
      const selection = await reverseGeocodeCoords(latitude, longitude);
      if (!selection) {
        setManualMode(true);
        setQuery('');
        setError('GPS found your position but could not resolve the street name. Please search or type your address.');
        onChange({
          formattedAddress: '',
          latitude,
          longitude,
          source: 'gps',
        });
        return;
      }
      applySelection(selection);
    } catch {
      setError('Failed to detect location. Search or type your address manually.');
      setManualMode(true);
    } finally {
      setGeoLoading(false);
    }
  };

  const confirmManualAddress = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setError('Enter at least 3 characters for your address.');
      return;
    }
    setResolving(true);
    setError(null);
    try {
      if (mapsReady) {
        try {
          const geocoder = new google.maps.Geocoder();
          const response = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
            geocoder.geocode({ address: trimmed }, (results, status) => {
              if (status === 'OK' && results?.length) resolve(results);
              else reject(new Error(status));
            });
          });
          const parsed = geocoderResultToSelection(response[0]);
          if (parsed) {
            applySelection({ ...parsed, source: 'manual' });
            return;
          }
        } catch {
          // Fall through to free server geocoding (OpenStreetMap).
        }
      }
      const serverResults = await fetchServerSuggestions(trimmed);
      const first = serverCacheRef.current.get(serverResults[0]?.placeId || '');
      if (first) {
        applySelection({
          formattedAddress: first.display_name,
          latitude: parseFloat(first.lat),
          longitude: parseFloat(first.lon),
          address: first.address,
          source: 'manual',
        });
        return;
      }
      if (value?.latitude != null && value?.longitude != null) {
        applySelection({
          formattedAddress: trimmed,
          latitude: value.latitude,
          longitude: value.longitude,
          address: parseAddressComponents([], trimmed),
          source: 'manual',
        });
        return;
      }
      setError('Could not verify this address. Pick a suggestion from the list if possible.');
    } catch {
      setError('Address lookup failed. Pick a suggestion or try a more specific address.');
    } finally {
      setResolving(false);
    }
  };

  const onInputChange = (text: string) => {
    setQuery(text);
    setError(null);
    if (value) onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!manualMode || mapsReady) fetchPredictions(text);
    }, DEBOUNCE_MS);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !predictions.length) {
      if (e.key === 'Enter' && manualMode) {
        e.preventDefault();
        confirmManualAddress();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = predictions[activeIndex >= 0 ? activeIndex : 0];
      if (pick) resolvePlaceId(pick.placeId, `${pick.mainText} ${pick.secondaryText}`);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const busy = searching || geoLoading || resolving;

  return (
    <div ref={containerRef} className={`space-y-2 ${className}`}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => {
            if (!sessionTokenRef.current) newSessionToken();
            if (predictions.length) setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {busy && (
          <Loader className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && predictions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1">
            {predictions.map((p, idx) => (
              <li key={p.placeId}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => resolvePlaceId(p.placeId, `${p.mainText} ${p.secondaryText}`)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    idx === activeIndex ? 'bg-primary/10' : 'hover:bg-muted/80'
                  }`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{p.mainText}</p>
                    {p.secondaryText && (
                      <p className="truncate text-xs text-muted-foreground">{p.secondaryText}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showUseCurrentLocation && (
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-xl"
          onClick={useCurrentLocation}
          disabled={busy}
        >
          {geoLoading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Detecting your location…
            </>
          ) : (
            <>
              <Navigation2 className="mr-2 h-4 w-4" />
              Use Current Location
            </>
          )}
        </Button>
      )}

      {(manualMode || !hasApiKey) && query.trim().length >= 3 && !value?.formattedAddress && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full rounded-xl"
          onClick={confirmManualAddress}
          disabled={busy}
        >
          {resolving ? 'Verifying address…' : 'Confirm typed address'}
        </Button>
      )}

      {env.USE_GOOGLE_MAPS && !hasApiKey && (
        <p className="text-xs text-amber-700">
          Google Maps key not configured — using server search. You can still type and confirm an address manually.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {value?.formattedAddress && value.latitude != null && value.longitude != null && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected location</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{value.formattedAddress}</p>
          {value.address?.street && (
            <p className="text-xs text-muted-foreground">
              {[value.address.street, value.address.town, value.address.country].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
