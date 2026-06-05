import { useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { apiClient } from '@/lib/api';
import type { Coordinates, NearbyFundi } from '@/lib/maps/types';
import { createGoogleMarkerIcon } from '@/lib/maps/googleMarkers';
import { DARK_MAP_STYLE } from '@/lib/maps/mapStyles';
import { useGoogleMapsReady } from './GoogleMapsProvider';
import MapUnavailable from './MapUnavailable';
import './maps.css';

interface SearchingRadarMapProps {
  center: Coordinates;
  height?: string | number;
  skill?: string | null;
}

export default function SearchingRadarMap({
  center,
  height = '100%',
  skill = null,
}: SearchingRadarMapProps) {
  const { isLoaded, hasApiKey } = useGoogleMapsReady();
  const [nearbyFundis, setNearbyFundis] = useState<NearbyFundi[]>([]);
  const customerIcon = useMemo(() => createGoogleMarkerIcon('customer', 'You'), [isLoaded]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiClient.searchFundis(center.latitude, center.longitude, skill) as {
          fundis?: Array<Record<string, unknown>>;
        };
        if (cancelled) return;
        const mapped = (res.fundis || [])
          .map((f) => ({
            id: String(f.id || f.user_id || ''),
            name: String(f.full_name || f.name || 'Fundi'),
            latitude: Number(f.latitude),
            longitude: Number(f.longitude),
            distanceKm: Number(f.distance_km || f.distanceKm || 0),
            skills: Array.isArray(f.skills) ? f.skills as string[] : [],
          }))
          .filter((f) => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
        setNearbyFundis(mapped);
      } catch {
        if (!cancelled) setNearbyFundis([]);
      }
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [center.latitude, center.longitude, skill]);

  if (!hasApiKey) {
    return (
      <div className="pf-map-shell" style={{ height }}>
        <MapUnavailable height={height} />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="pf-map-shell pf-map-loading" style={{ height }}>
        <div className="pf-map-loading__spinner" />
      </div>
    );
  }

  return (
    <div className="pf-map-shell" style={{ height }}>
      <div className="pf-radar pointer-events-none z-[400]">
        <span className="pf-radar__ring" />
        <span className="pf-radar__ring" />
        <span className="pf-radar__ring" />
      </div>
      <GoogleMap
        mapContainerClassName="pf-google-map"
        center={{ lat: center.latitude, lng: center.longitude }}
        zoom={14}
        options={{
          disableDefaultUI: true,
          gestureHandling: 'none',
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          styles: DARK_MAP_STYLE,
          clickableIcons: false,
        }}
      >
        {customerIcon && (
          <Marker
            position={{ lat: center.latitude, lng: center.longitude }}
            icon={customerIcon}
            title="Your location"
          />
        )}
        {nearbyFundis.map((fundi) => {
          const icon = createGoogleMarkerIcon('nearby');
          if (!icon) return null;
          return (
            <Marker
              key={fundi.id}
              position={{ lat: fundi.latitude, lng: fundi.longitude }}
              icon={icon}
              title={fundi.name}
            />
          );
        })}
      </GoogleMap>
      <div className="pf-map-overlay-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Searching nearby</p>
        <p className="mt-1 text-lg font-bold text-slate-900">
          {nearbyFundis.length > 0 ? `${nearbyFundis.length} fundis nearby` : 'Scanning your area...'}
        </p>
        {nearbyFundis.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nearbyFundis.slice(0, 4).map((f) => (
              <span key={f.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {f.name.split(' ')[0]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
