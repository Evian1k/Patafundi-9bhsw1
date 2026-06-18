import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker, Polyline, Circle } from '@react-google-maps/api';
import { Crosshair, Layers, Minus, Plus } from 'lucide-react';
import type { Coordinates, MapTheme } from '@/lib/maps/types';
import { createGoogleMarkerIcon } from '@/lib/maps/googleMarkers';
import { DEFAULT_CENTER, mapStylesForTheme } from '@/lib/maps/mapStyles';
import { useGoogleMapsReady } from './GoogleMapsProvider';
import OsmLiveTrackingMap from './OsmLiveTrackingMap';
import './maps.css';

function toLatLng(c: Coordinates): google.maps.LatLngLiteral {
  return { lat: c.latitude, lng: c.longitude };
}

function FitBounds({
  map,
  points,
}: {
  map: google.maps.Map | null;
  points: Coordinates[];
}) {
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.panTo(toLatLng(points[0]));
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(toLatLng(p)));
    map.fitBounds(bounds, 48);
  }, [map, points.map((p) => `${p.latitude},${p.longitude}`).join('|')]);

  return null;
}

interface LiveTrackingMapProps {
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

export default function LiveTrackingMap({
  customer,
  fundi,
  routePath = [],
  height = '100%',
  showControls = true,
  defaultTheme = 'dark',
  overlay,
  autoFit = true,
  showPulse = true,
}: LiveTrackingMapProps) {
  const { isLoaded, hasApiKey, useGoogleMaps } = useGoogleMapsReady();
  const googleActive = useGoogleMaps && hasApiKey;
  const [theme, setTheme] = useState<MapTheme>(defaultTheme);
  const [map, setMap] = useState<google.maps.Map | null>(null);

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

  const customerIcon = useMemo(() => createGoogleMarkerIcon('customer', 'You'), [isLoaded]);
  const fundiIcon = useMemo(() => createGoogleMarkerIcon('fundi', 'Fundi'), [isLoaded]);

  const onLoad = useCallback((loadedMap: google.maps.Map) => setMap(loadedMap), []);
  const onUnmount = useCallback(() => setMap(null), []);

  const recenter = () => {
    if (!map || fitPoints.length === 0) return;
    if (fitPoints.length === 1) {
      map.panTo(toLatLng(fitPoints[0]));
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    fitPoints.forEach((p) => bounds.extend(toLatLng(p)));
    map.fitBounds(bounds, 48);
  };

  if (!googleActive) {
    return (
      <OsmLiveTrackingMap
        customer={customer}
        fundi={fundi}
        routePath={routePath}
        height={height}
        showControls={showControls}
        defaultTheme={defaultTheme}
        overlay={overlay}
        autoFit={autoFit}
        showPulse={showPulse}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div className="pf-map-shell pf-map-loading" style={{ height }}>
        <div className="pf-map-loading__spinner" />
        {overlay}
      </div>
    );
  }

  return (
    <div className="pf-map-shell" style={{ height }}>
      <GoogleMap
        mapContainerClassName="pf-google-map"
        center={toLatLng(center)}
        zoom={14}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: 'greedy',
          styles: mapStylesForTheme(theme),
          clickableIcons: false,
        }}
      >
        {autoFit && <FitBounds map={map} points={fitPoints} />}
        {polylinePath.length > 1 && (
          <Polyline
            path={polylinePath}
            options={{
              strokeColor: '#10b981',
              strokeOpacity: 0.92,
              strokeWeight: 5,
              geodesic: true,
              icons: [{
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: '#10b981' },
                offset: '50%',
                repeat: '120px',
              }],
            }}
          />
        )}
        {showPulse && customer && (
          <Circle
            center={toLatLng(customer)}
            options={{
              radius: 80,
              fillColor: '#2563eb',
              fillOpacity: 0.12,
              strokeColor: '#2563eb',
              strokeOpacity: 0.35,
              strokeWeight: 1,
            }}
          />
        )}
        {showPulse && fundi && (
          <Circle
            center={toLatLng(fundi)}
            options={{
              radius: 60,
              fillColor: '#10b981',
              fillOpacity: 0.15,
              strokeColor: '#10b981',
              strokeOpacity: 0.4,
              strokeWeight: 1,
            }}
          />
        )}
        {customer && customerIcon && (
          <Marker position={toLatLng(customer)} icon={customerIcon} title="Your location" />
        )}
        {fundi && fundiIcon && (
          <Marker position={toLatLng(fundi)} icon={fundiIcon} title="Fundi" />
        )}
      </GoogleMap>

      {showControls && (
        <div className="pf-map-controls">
          <button type="button" className="pf-map-control-btn" onClick={() => map?.setZoom((map.getZoom() || 14) + 1)} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="pf-map-control-btn" onClick={() => map?.setZoom((map.getZoom() || 14) - 1)} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" className="pf-map-control-btn" onClick={recenter} aria-label="Recenter map">
            <Crosshair className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="pf-map-control-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
