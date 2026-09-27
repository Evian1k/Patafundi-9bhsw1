import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const fittedOnce = useRef(false);

  useEffect(() => {
    if (points.length === 0) return;
    // Programmatic camera moves are intentionally non-animated: animated
    // zoom/pan can outlive the container (modals closing, wizard steps
    // swapping) and crash Leaflet's transition end handler with
    // "Cannot read properties of undefined (reading '_leaflet_pos')".
    try {
      if (points.length === 1) {
        map.setView(toLatLng(points[0]), 15, { animate: false });
      } else {
        const bounds = L.latLngBounds(points.map((p) => toLatLng(p)));
        map.fitBounds(bounds, { padding: [48, 48], animate: fittedOnce.current });
      }
      fittedOnce.current = true;
    } catch {
      /* map already torn down — nothing to fit */
    }
  }, [map, key, points]);

  return null;
}

/**
 * Teardown guard (spec §12): React runs child effect cleanups BEFORE the
 * MapContainer's own unmount (map.remove()). Calling map.stop() here cancels
 * any in-flight pan/zoom animation while the map is still fully intact, so
 * its transition-end handler can never fire on a removed map — the root
 * cause of the _leaflet_pos crash during route/modal transitions.
 */
function MapLifecycleGuard() {
  const map = useMap();
  useEffect(() => {
    return () => {
      try {
        map.stop();
      } catch {
        /* map already removed */
      }
    };
  }, [map]);
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
  /** 'customer' = customer tracking fundi (default), 'fundi' = fundi navigating to customer */
  viewMode?: 'customer' | 'fundi';
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
  viewMode = 'customer',
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

  // When fundi is viewing, swap labels: fundi = "You", customer = "Customer"
  const fundiLabel = viewMode === 'fundi' ? 'You' : 'Fundi';
  const customerLabel = viewMode === 'fundi' ? 'Customer' : 'You';
  const customerIcon = useMemo(
    () => viewMode === 'fundi' ? createOsmMarkerIcon('fundi', customerLabel) : createOsmMarkerIcon('customer', customerLabel),
    [viewMode, customerLabel],
  );
  const fundiIcon = useMemo(
    () => viewMode === 'fundi' ? createOsmMarkerIcon('customer', fundiLabel) : createOsmMarkerIcon('fundi', fundiLabel),
    [viewMode, fundiLabel],
  );

  const recenter = () => {
    if (!map || fitPoints.length === 0) return;
    try {
      if (fitPoints.length === 1) {
        map.setView(toLatLng(fitPoints[0]), 15);
        return;
      }
      const bounds = L.latLngBounds(fitPoints.map((p) => toLatLng(p)));
      map.fitBounds(bounds, { padding: [48, 48] });
    } catch {
      /* map removed mid-click — ignore */
    }
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
        <MapLifecycleGuard />
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
