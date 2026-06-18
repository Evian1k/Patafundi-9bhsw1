/**
 * PataFundi custom map marker system.
 *
 * Premium Uber-quality markers with:
 *   - Profile photo or initials fallback
 *   - Role-specific colors and badges
 *   - Pulse ring for active states
 *   - Verification badge for approved fundis
 *   - Online/offline indicator
 *
 * Usage:
 *   import { CustomerMarker, FundiMarker, AdminMarker } from "@/components/maps/MapMarkers";
 *   <CustomerMarker position={latLng} name="John Doe" photoUrl={url} state="waiting" />
 *   <FundiMarker position={latLng} name="Jane" photoUrl={url} verified state="travelling" />
 */

import { memo, useMemo } from "react";
import { BadgeCheck, Shield, Wrench, User, MapPin } from "lucide-react";

// ---------- Color system ----------
export const MARKER_COLORS = {
  customer: {
    primary: "#2595FF",      // blue
    glow: "rgba(37, 149, 255, 0.35)",
    ring: "rgba(37, 149, 255, 0.6)",
  },
  fundi: {
    available: "#10B981",     // green
    busy: "#F59E0B",          // amber
    travelling: "#8B5CF6",    // purple
    working: "#EF4444",       // red
    offline: "#6B7280",       // grey
  },
  admin: {
    primary: "#1E293B",       // dark slate
    glow: "rgba(30, 41, 59, 0.3)",
    ring: "rgba(30, 41, 59, 0.5)",
  },
} as const;

// ---------- Initials generator ----------
function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- Shared marker shell ----------
interface MarkerShellProps {
  color: string;
  glowColor: string;
  ringColor: string;
  photoUrl?: string | null;
  initials: string;
  size?: number;
  pulse?: boolean;
  badge?: React.ReactNode;
  label?: string;
}

function MarkerShell({ color, glowColor, ringColor, photoUrl, initials, size = 44, pulse, badge, label }: MarkerShellProps) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      {/* Pulse ring (for active states) */}
      {pulse && (
        <span
          className="absolute rounded-full animate-ping"
          style={{
            width: size,
            height: size,
            backgroundColor: glowColor,
            top: 0,
          }}
        />
      )}
      {/* Outer ring */}
      <div
        className="relative rounded-full flex items-center justify-center overflow-hidden border-2 shadow-lg"
        style={{
          width: size,
          height: size,
          borderColor: color,
          boxShadow: `0 4px 12px ${glowColor}, 0 0 0 2px ${ringColor}`,
          backgroundColor: photoUrl ? "transparent" : color,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={initials}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        {!photoUrl && (
          <span className="text-white font-bold text-sm select-none">{initials}</span>
        )}
        {/* Fallback initials hidden behind image, shown if image fails */}
        {photoUrl && (
          <span className="hidden absolute inset-0 flex items-center justify-center text-white font-bold text-sm bg-white/10">
            {initials}
          </span>
        )}
      </div>
      {/* Badge (verified icon, shield, etc.) */}
      {badge && (
        <div
          className="absolute -bottom-1 -right-1 rounded-full p-0.5 bg-white shadow-md"
          style={{ width: size * 0.35, height: size * 0.35 }}
        >
          {badge}
        </div>
      )}
      {/* Label below marker */}
      {label && (
        <div className="mt-1 px-2 py-0.5 rounded-full bg-white/90 shadow-sm text-[10px] font-medium text-center whitespace-nowrap" style={{ color }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ---------- Customer Marker ----------
export type CustomerState = "waiting" | "assigned" | "active" | "completed";

interface CustomerMarkerProps {
  name: string;
  photoUrl?: string | null;
  state?: CustomerState;
  size?: number;
  showLabel?: boolean;
}

export const CustomerMarker = memo(function CustomerMarker({
  name,
  photoUrl,
  state = "waiting",
  size = 44,
  showLabel = false,
}: CustomerMarkerProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const colors = MARKER_COLORS.customer;
  const pulse = state === "waiting" || state === "active";

  return (
    <MarkerShell
      color={colors.primary}
      glowColor={colors.glow}
      ringColor={colors.ring}
      photoUrl={photoUrl}
      initials={initials}
      size={size}
      pulse={pulse}
      badge={<User className="w-full h-full text-blue-500" />}
      label={showLabel ? name : undefined}
    />
  );
});

// ---------- Fundi Marker ----------
export type FundiState = "available" | "busy" | "travelling" | "working" | "offline";

interface FundiMarkerProps {
  name: string;
  photoUrl?: string | null;
  verified?: boolean;
  state?: FundiState;
  rating?: number;
  size?: number;
  showLabel?: boolean;
}

export const FundiMarker = memo(function FundiMarker({
  name,
  photoUrl,
  verified = false,
  state = "available",
  rating,
  size = 44,
  showLabel = false,
}: FundiMarkerProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const color = MARKER_COLORS.fundi[state] || MARKER_COLORS.fundi.available;
  const glow = `${color}59`; // ~35% opacity
  const ring = `${color}99`; // ~60% opacity
  const pulse = state === "travelling" || state === "working";

  const badge = verified ? (
    <BadgeCheck className="w-full h-full text-blue-500" />
  ) : state === "working" ? (
    <Wrench className="w-full h-full text-red-500" />
  ) : null;

  const label = showLabel
    ? `${name}${rating ? ` • ${Number(rating).toFixed(1)}★` : ""}`
    : undefined;

  return (
    <MarkerShell
      color={color}
      glowColor={glow}
      ringColor={ring}
      photoUrl={photoUrl}
      initials={initials}
      size={size}
      pulse={pulse}
      badge={badge}
      label={label}
    />
  );
});

// ---------- Admin Marker ----------
interface AdminMarkerProps {
  name: string;
  photoUrl?: string | null;
  size?: number;
  showLabel?: boolean;
}

export const AdminMarker = memo(function AdminMarker({
  name,
  photoUrl,
  size = 44,
  showLabel = false,
}: AdminMarkerProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const colors = MARKER_COLORS.admin;

  return (
    <MarkerShell
      color={colors.primary}
      glowColor={colors.glow}
      ringColor={colors.ring}
      photoUrl={photoUrl}
      initials={initials}
      size={size}
      badge={<Shield className="w-full h-full text-slate-700" />}
      label={showLabel ? `Admin • ${name}` : undefined}
    />
  );
});

// ---------- Job Destination Marker ----------
interface JobMarkerProps {
  serviceCategory?: string;
  size?: number;
}

export const JobMarker = memo(function JobMarker({ serviceCategory, size = 40 }: JobMarkerProps) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <div
        className="rounded-full flex items-center justify-center shadow-lg border-2 border-white"
        style={{
          width: size,
          height: size,
          backgroundColor: "#F97316", // orange
          boxShadow: "0 4px 12px rgba(249, 115, 22, 0.4)",
        }}
      >
        <MapPin className="w-1/2 h-1/2 text-white" />
      </div>
      {serviceCategory && (
        <div className="mt-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-medium shadow-sm whitespace-nowrap">
          {serviceCategory}
        </div>
      )}
    </div>
  );
});

// ---------- Marker HTML generator (for Google Maps OverlayView) ----------
/**
 * Converts a marker component to an HTML string for use with
 * GoogleMarkerOverlay or @react-google-maps/api AdvancedMarkerView.
 * This avoids the React-in-Google-Maps bridge overhead.
 */
export function markerToHtml(props: {
  type: "customer" | "fundi" | "admin" | "job";
  name?: string;
  photoUrl?: string | null;
  state?: CustomerState | FundiState;
  verified?: boolean;
  rating?: number;
  serviceCategory?: string;
}): string {
  const { type, name = "", photoUrl, state, verified, rating, serviceCategory } = props;
  const initials = getInitials(name);
  const size = 44;

  let color = "#2595FF";
  let badge = "";
  if (type === "fundi") {
    color = MARKER_COLORS.fundi[state as FundiState] || MARKER_COLORS.fundi.available;
    if (verified) badge = `<div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-md"><svg viewBox="0 0 24 24" fill="#3B82F6" class="w-3 h-3"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" fill="none"/></svg></div>`;
  } else if (type === "admin") {
    color = "#1E293B";
  } else if (type === "job") {
    color = "#F97316";
  }

  const pulseClass = (type === "fundi" && (state === "travelling" || state === "working")) || (type === "customer" && (state === "waiting" || state === "active")) ? "animate-ping" : "";

  return `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:${size}px;">
      ${pulseClass ? `<span style="position:absolute;width:${size}px;height:${size}px;border-radius:9999px;background:${color}59;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>` : ""}
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;border:2px solid ${color};box-shadow:0 4px 12px ${color}59;background:${photoUrl ? "transparent" : color};overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${photoUrl ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><span style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">${initials}</span>` : `<span style="color:white;font-weight:700;font-size:14px;">${initials}</span>`}
      </div>
      ${badge}
      ${name ? `<div style="margin-top:4px;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,0.95);box-shadow:0 1px 3px rgba(0,0,0,0.1);font-size:10px;font-weight:500;color:${color};white-space:nowrap;">${type === "fundi" && rating ? `${name} • ${Number(rating).toFixed(1)}★` : name}</div>` : ""}
    </div>
  `;
}
