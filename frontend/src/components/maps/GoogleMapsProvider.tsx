import { createContext, useContext, useMemo } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { env } from '@/config/env';

const LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry'];

type GoogleMapsContextValue = {
  isLoaded: boolean;
  loadError: Error | undefined;
  hasApiKey: boolean;
  useGoogleMaps: boolean;
};

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: undefined,
  hasApiKey: false,
  useGoogleMaps: false,
});

export function useGoogleMapsReady() {
  return useContext(GoogleMapsContext);
}

function GoogleMapsLoader({ children }: { children: React.ReactNode }) {
  const apiKey = env.GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'patafundi-google-maps',
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const value = useMemo(
    () => ({
      isLoaded: Boolean(apiKey) && isLoaded,
      loadError,
      hasApiKey: Boolean(apiKey),
      useGoogleMaps: true,
    }),
    [apiKey, isLoaded, loadError],
  );

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

const DISABLED_GOOGLE_MAPS_VALUE: GoogleMapsContextValue = {
  isLoaded: false,
  loadError: undefined,
  hasApiKey: Boolean(env.GOOGLE_MAPS_API_KEY),
  useGoogleMaps: false,
};

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  if (!env.USE_GOOGLE_MAPS) {
    return (
      <GoogleMapsContext.Provider value={DISABLED_GOOGLE_MAPS_VALUE}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader>{children}</GoogleMapsLoader>;
}
