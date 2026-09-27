/**
 * PataFundi route visualization — Uber-style animated route drawing.
 *
 * Features:
 *   - Progressive line animation (route "draws" itself over ~1.5s)
 *   - Color changes based on job status (blue=accepted, purple=travelling,
 *     red=working, green=completed)
 *   - Distance + ETA overlay
 *   - Traffic-aware coloring (if Google Directions API returns traffic data)
 *
 * Works with both @react-google-maps/api and react-leaflet.
 * The Polyline component from the active map library is passed in as a prop
 * to avoid a hard dependency on either.
 */

import { memo, useEffect, useState, useMemo } from "react";

export type JobRouteStatus = "accepted" | "travelling" | "arrived" | "working" | "completed" | "cancelled";

export const ROUTE_COLORS: Record<JobRouteStatus, string> = {
  accepted: "#2595FF",     // blue
  travelling: "#8B5CF6",   // purple
  arrived: "#F59E0B",      // amber
  working: "#EF4444",      // red
  completed: "#10B981",    // green
  cancelled: "#6B7280",    // grey
};

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceKm?: number;
  durationMin?: number;
  durationInTrafficMin?: number;
  trafficColor?: string; // override color if traffic is heavy
}

interface RouteOverlayProps {
  /** Polyline component from the active map library (Google or Leaflet). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Polyline: React.ComponentType<any>;
  points: RoutePoint[];
  status?: JobRouteStatus;
  info?: RouteInfo;
  /** Animate the line drawing over this many ms. Default 1500. */
  drawDurationMs?: number;
}

/**
 * Renders a progressively-drawn polyline for the fundi→customer route.
 * The animation uses a simple "reveal" approach: we incrementally show
 * more points from the array over the draw duration.
 */
export const RouteOverlay = memo(function RouteOverlay({
  Polyline,
  points,
  status = "travelling",
  info,
  drawDurationMs = 1500,
}: RouteOverlayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!points.length) return;
    setProgress(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / drawDurationMs);
      // Ease-out cubic for natural feel
      setProgress(1 - Math.pow(1 - pct, 3));
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points, drawDurationMs]);

  const visiblePoints = useMemo(() => {
    if (!points.length) return [];
    const count = Math.max(2, Math.ceil(points.length * progress));
    return points.slice(0, count);
  }, [points, progress]);

  const color = info?.trafficColor || ROUTE_COLORS[status];

  if (visiblePoints.length < 2) return null;

  return (
    <>
      <Polyline
        path={visiblePoints}
        options={{
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: 0.9,
          geodesic: true,
          zIndex: 100,
        }}
      />
      {/* Glow underlay for premium feel */}
      <Polyline
        path={visiblePoints}
        options={{
          strokeColor: color,
          strokeWeight: 12,
          strokeOpacity: 0.15,
          geodesic: true,
          zIndex: 99,
        }}
      />
    </>
  );
});

/**
 * Route info badge — shows distance + ETA as a floating overlay on the map.
 */
interface RouteInfoBadgeProps {
  info: RouteInfo;
  status: JobRouteStatus;
}

export const RouteInfoBadge = memo(function RouteInfoBadge({ info, status }: RouteInfoBadgeProps) {
  const color = ROUTE_COLORS[status];
  const hasTraffic = info.durationInTrafficMin != null && info.durationMin != null;
  const trafficRatio = hasTraffic ? info.durationInTrafficMin! / info.durationMin! : 1;
  const trafficLabel = trafficRatio > 1.3 ? "Heavy traffic" : trafficRatio > 1.1 ? "Light traffic" : "Clear";

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border"
      style={{ borderColor: `${color}40` }}
    >
      {info.distanceKm != null && (
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold" style={{ color }}>{info.distanceKm.toFixed(1)}</span>
          <span className="text-[10px] text-muted-foreground">km</span>
        </div>
      )}
      <div className="w-px h-8 bg-border" />
      {info.durationInTrafficMin != null ? (
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold" style={{ color }}>{Math.round(info.durationInTrafficMin)}</span>
          <span className="text-[10px] text-muted-foreground">min (traffic)</span>
        </div>
      ) : info.durationMin != null ? (
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold" style={{ color }}>{Math.round(info.durationMin)}</span>
          <span className="text-[10px] text-muted-foreground">min</span>
        </div>
      ) : null}
      {hasTraffic && (
        <div className="w-px h-8 bg-border" />
      )}
      {hasTraffic && (
        <div className="flex flex-col items-center">
          <span className="text-xs font-medium" style={{ color: trafficRatio > 1.3 ? "#EF4444" : trafficRatio > 1.1 ? "#F59E0B" : "#10B981" }}>
            {trafficLabel}
          </span>
        </div>
      )}
    </div>
  );
});
