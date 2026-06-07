import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Layers, Minus, Plus } from 'lucide-react';
import type { Coordinates, MapTheme } from '@/lib/maps/types';
import { DEFAULT_CENTER } from '@/lib/maps/mapStyles';
import { createOsmMarkerIcon, OSM_TILES } from './osmMarkers';
import 'leaflet/dist/leaflet.css';
import './maps.css';

function toLatLng(c: Coordinates): L.LatLngExpression {
  return [c.latitude, c.longitude];
}

function FitBounds({ points }: { points: Coordinates[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.latitude},${p.longitude}`).join('|');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(toLatLng(points[0]), 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => toLatLng(p)));
    map.fitBounds(bounds, { padding: [48, 48] });
  }, [map, key, points]);

  return null;
}

function MapRefBridge({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

interface OsmLiveTrackingMapProps {
  customer?: Coordinates | null;
  fundi?: Coordinates | null;
  routePath?: Coordinates[];
  height?: string | number;
  showControls?: boolean;
  defaultTheme?: MapTheme;
  overlay?: React.ReactNode;
  autoFit?: boolean;
  showPulse?: boolean;
}

export default function OsmLiveTrackingMap({
  customer,
  fundi,
  routePath = [],
  height = '100%',
  showControls = true,
  defaultTheme = 'dark',
  overlay,
  autoFit = true,
  showPulse = true,
}: OsmLiveTrackingMapProps) {
  const [theme, setTheme] = useState<MapTheme>(defaultTheme);
  const [map, setMap] = useState<L.Map | null>(null);
  const tiles = OSM_TILES[theme];
  const onMapReady = useCallback((instance: L.Map) => setMap(instance), []);

  const center = customer || fundi || { latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng };
  const fitPoints = useMemo(
    () => [customer, fundi, ...routePath].filter(Boolean) as Coordinates[],
    [customer, fundi, routePath],
  );

  const polylinePath = useMemo(() => {
    if (routePath.length > 1) return routePath.map(toLatLng);
    if (customer && fundi) return [toLatLng(customer), toLatLng(fundi)];
    return [];
  }, [routePath, customer, fundi]);

  const customerIcon = useMemo(() => createOsmMarkerIcon('customer', 'You'), []);
  const fundiIcon = useMemo(() => createOsmMarkerIcon('fundi', 'Fundi'), []);

  const recenter = () => {
    if (!map || fitPoints.length === 0) return;
    if (fitPoints.length === 1) {
      map.setView(toLatLng(fitPoints[0]), 15);
      return;
    }
    const bounds = L.latLngBounds(fitPoints.map((p) => toLatLng(p)));
    map.fitBounds(bounds, { padding: [48, 48] });
  };

  return (
    <div className="pf-map-shell" style={{ height }}>
      <MapContainer
        className="pf-osm-map"
        center={toLatLng(center)}
        zoom={14}
        scrollWheelZoom
        zoomControl={false}
        attributionControl
      >
        <TileLayer key={theme} url={tiles.url} attribution={tiles.attribution} />
        <MapRefBridge onMap={onMapReady} />
        {autoFit && <FitBounds points={fitPoints} />}
        {polylinePath.length > 1 && (
          <Polyline positions={polylinePath} pathOptions={{ color: '#10b981', weight: 5, opacity: 0.92 }} />
        )}
        {showPulse && customer && (
          <Circle
            center={toLatLng(customer)}
            radius={80}
            pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.12, weight: 1, opacity: 0.35 }}
          />
        )}
        {showPulse && fundi && (
          <Circle
            center={toLatLng(fundi)}
            radius={60}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.15, weight: 1, opacity: 0.4 }}
          />
        )}
        {customer && <Marker position={toLatLng(customer)} icon={customerIcon} />}
        {fundi && <Marker position={toLatLng(fundi)} icon={fundiIcon} />}
      </MapContainer>

      {showControls && map && (
        <div className="pf-map-controls">
          <button type="button" className="pf-map-control-btn" onClick={() => map.zoomIn()} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="pf-map-control-btn" onClick={() => map.zoomOut()} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" className="pf-map-control-btn" onClick={recenter} aria-label="Recenter map">
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="pf-map-control-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle map theme"
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>
      )}
      {overlay}
    </div>
  );
}
