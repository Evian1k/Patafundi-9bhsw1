import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { apiClient } from '@/lib/api';
import type { Coordinates, NearbyFundi } from '@/lib/maps/types';
import { createOsmMarkerIcon, OSM_TILES } from './osmMarkers';
import 'leaflet/dist/leaflet.css';
import './maps.css';

interface OsmSearchingRadarMapProps {
  center: Coordinates;
  height?: string | number;
  skill?: string | null;
}

export default function OsmSearchingRadarMap({
  center,
  height = '100%',
  skill = null,
}: OsmSearchingRadarMapProps) {
  const [nearbyFundis, setNearbyFundis] = useState<NearbyFundi[]>([]);
  const customerIcon = useMemo(() => createOsmMarkerIcon('customer', 'You'), []);
  const tiles = OSM_TILES.dark;

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

  return (
    <div className="pf-map-shell" style={{ height }}>
      <div className="pf-radar pointer-events-none z-[400]">
        <span className="pf-radar__ring" />
        <span className="pf-radar__ring" />
        <span className="pf-radar__ring" />
      </div>
      <MapContainer
        className="pf-osm-map"
        center={[center.latitude, center.longitude]}
        zoom={14}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} />
        <Marker position={[center.latitude, center.longitude]} icon={customerIcon} />
        {nearbyFundis.map((fundi) => (
          <Marker
            key={fundi.id}
            position={[fundi.latitude, fundi.longitude]}
            icon={createOsmMarkerIcon('nearby')}
            title={fundi.name}
          />
        ))}
      </MapContainer>
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
