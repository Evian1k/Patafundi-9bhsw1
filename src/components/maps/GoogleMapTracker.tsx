/**
 * GoogleMapTracker — Live fundi tracking map using Google Maps JavaScript API.
 * Falls back to a styled card if VITE_GOOGLE_MAPS_API_KEY is not set.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { env, isMapsConfigured } from "@/config/env";
import { MapPin, Navigation, Clock, AlertCircle, Loader2 } from "lucide-react";

interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  fundiLocation?: LatLng | null;
  customerLocation?: LatLng | null;
  fundiName?: string;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  jobStatus?: string;
  /** Called when the map loads */
  onMapReady?: () => void;
}

declare global {
  interface Window {
    google: typeof google;
    initGoogleMap?: () => void;
  }
}

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) { resolve(); return; }
    loadCallbacks.push(resolve);
    if (googleMapsLoading) return;
    googleMapsLoading = true;

    window.initGoogleMap = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMap&libraries=geometry`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

/** Fallback card when Google Maps is not configured */
function MapFallback({ fundiName, etaMinutes, distanceKm, jobStatus }: Omit<Props, "fundiLocation" | "customerLocation" | "onMapReady">) {
  const statusColors: Record<string, string> = {
    on_the_way: "bg-orange-500",
    arrived: "bg-green-500",
    in_progress: "bg-blue-500",
  };
  const dotColor = statusColors[jobStatus ?? ""] ?? "bg-primary";

  return (
    <div className="relative w-full h-full min-h-[240px] bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-3">
      {/* Grid lines for map feel */}
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`h${i}`} className="absolute w-full h-px bg-slate-400" style={{ top: `${(i + 1) * 12.5}%` }} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`v${i}`} className="absolute h-full w-px bg-slate-400" style={{ left: `${(i + 1) * 12.5}%` }} />
        ))}
      </div>

      {/* Animated ping for fundi location */}
      <div className="relative z-10">
        <div className={`w-14 h-14 rounded-full ${dotColor} flex items-center justify-center shadow-lg`}>
          <Navigation className="w-6 h-6 text-white" />
        </div>
        <span className={`absolute inset-0 rounded-full ${dotColor} opacity-30 animate-ping`} />
      </div>

      {fundiName && (
        <p className="z-10 font-semibold text-slate-700 text-sm">{fundiName}</p>
      )}

      <div className="z-10 flex gap-4 text-xs text-slate-600">
        {etaMinutes != null && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {etaMinutes} min ETA
          </span>
        )}
        {distanceKm != null && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {distanceKm.toFixed(1)} km
          </span>
        )}
      </div>

      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 text-[10px] text-slate-400 bg-white/70 px-2 py-1 rounded-lg">
        <AlertCircle className="w-3 h-3" />
        Map unavailable — configure Google Maps
      </div>
    </div>
  );
}

export default function GoogleMapTracker({
  fundiLocation,
  customerLocation,
  fundiName = "Fundi",
  etaMinutes,
  distanceKm,
  jobStatus,
  onMapReady,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const fundiMarkerRef = useRef<google.maps.Marker | null>(null);
  const customerMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Default center: Nairobi CBD
  const defaultCenter = { lat: -1.2921, lng: 36.8219 };

  const initMap = useCallback(async () => {
    if (!mapRef.current || !isMapsConfigured()) return;
    try {
      await loadGoogleMaps(env.GOOGLE_MAPS_API_KEY);
      if (!mapRef.current) return;

      const center = customerLocation ?? fundiLocation ?? defaultCenter;
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 14,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#ffffff" }],
          },
          {
            featureType: "road.arterial",
            elementType: "labels.text.fill",
            stylers: [{ color: "#757575" }],
          },
          {
            featureType: "road.highway",
            elementType: "geometry",
            stylers: [{ color: "#dadada" }],
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#c9c9c9" }],
          },
          {
            featureType: "water",
            elementType: "labels.text.fill",
            stylers: [{ color: "#9e9e9e" }],
          },
        ],
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapInstanceRef.current = map;

      // Customer marker (blue dot)
      if (customerLocation) {
        customerMarkerRef.current = new window.google.maps.Marker({
          position: customerLocation,
          map,
          title: "Your Location",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#3B82F6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
      }

      // Fundi marker (orange pin)
      if (fundiLocation) {
        fundiMarkerRef.current = new window.google.maps.Marker({
          position: fundiLocation,
          map,
          title: fundiName,
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
            fillColor: "#F97316",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 2,
            anchor: new window.google.maps.Point(12, 24),
          },
        });

        // Info window with fundi name
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="font-size:13px;font-weight:600;padding:4px 8px;">${fundiName}</div>`,
        });
        fundiMarkerRef.current.addListener("click", () => {
          infoWindow.open(map, fundiMarkerRef.current!);
        });
      }

      // Draw route line
      if (fundiLocation && customerLocation) {
        routeLineRef.current = new window.google.maps.Polyline({
          path: [fundiLocation, customerLocation],
          geodesic: true,
          strokeColor: "#F97316",
          strokeOpacity: 0.7,
          strokeWeight: 3,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 },
              offset: "0",
              repeat: "20px",
            },
          ],
        });
        routeLineRef.current.setMap(map);
      }

      // Fit bounds to show both markers
      if (fundiLocation && customerLocation) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(fundiLocation);
        bounds.extend(customerLocation);
        map.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
      }

      setMapLoaded(true);
      onMapReady?.();
    } catch (e) {
      console.error("[GoogleMapTracker] Map init failed:", e);
      setMapError(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isMapsConfigured()) {
      initMap();
    }
  }, [initMap]);

  // Update fundi marker position on live updates
  useEffect(() => {
    if (!fundiLocation || !mapInstanceRef.current) return;

    if (fundiMarkerRef.current) {
      fundiMarkerRef.current.setPosition(fundiLocation);
    } else if (mapLoaded) {
      fundiMarkerRef.current = new window.google.maps.Marker({
        position: fundiLocation,
        map: mapInstanceRef.current,
        title: fundiName,
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#F97316",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 2,
          anchor: new window.google.maps.Point(12, 24),
        },
      });
    }

    // Update route line
    if (routeLineRef.current && customerLocation) {
      routeLineRef.current.setPath([fundiLocation, customerLocation]);
    }

    // Smooth pan toward fundi
    if (mapInstanceRef.current && jobStatus === "on_the_way") {
      mapInstanceRef.current.panTo(fundiLocation);
    }
  }, [fundiLocation, mapLoaded, fundiName, customerLocation, jobStatus]);

  if (!isMapsConfigured() || mapError) {
    return (
      <MapFallback
        fundiName={fundiName}
        etaMinutes={etaMinutes}
        distanceKm={distanceKm}
        jobStatus={jobStatus}
      />
    );
  }

  return (
    <div className="relative w-full h-full min-h-[260px] rounded-2xl overflow-hidden">
      <div ref={mapRef} className="w-full h-full min-h-[260px]" />

      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-slate-500">Loading map...</p>
          </div>
        </div>
      )}

      {/* ETA / distance pill overlay */}
      {mapLoaded && (etaMinutes != null || distanceKm != null) && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-4 text-sm font-medium border border-white/50">
          {etaMinutes != null && (
            <span className="flex items-center gap-1.5 text-orange-600">
              <Clock className="w-3.5 h-3.5" />
              {etaMinutes} min away
            </span>
          )}
          {distanceKm != null && (
            <span className="flex items-center gap-1.5 text-slate-600">
              <MapPin className="w-3.5 h-3.5" />
              {distanceKm.toFixed(1)} km
            </span>
          )}
        </div>
      )}
    </div>
  );
}
