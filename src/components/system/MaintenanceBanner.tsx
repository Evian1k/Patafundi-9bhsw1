/**
 * MaintenanceBanner — shown to STAFF ONLY when the platform is in
 * maintenance mode. Lets them know customers are blocked and provides
 * a quick link to toggle maintenance off.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wrench, X, ExternalLink } from "lucide-react";
import { apiClient } from "@/lib/api";

export default function MaintenanceBanner() {
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check feature flags periodically to detect maintenance mode
    const check = async () => {
      try {
        const res = await apiClient.request("/admin/feature-flags", { includeAuth: true }) as any;
        const flags = res?.flags || [];
        const maintFlag = flags.find((f: any) => f.key === "maintenance_mode");
        setMaintenanceOn(maintFlag?.is_enabled === true);
      } catch {
        // If we can't fetch flags (e.g. not staff), silently ignore
      }
    };
    check();
    const interval = setInterval(check, 30_000); // check every 30s
    return () => clearInterval(interval);
  }, []);

  if (!maintenanceOn || dismissed) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 shrink-0 animate-pulse" />
        <span className="font-medium">
          Maintenance Mode is ON
        </span>
        <span className="hidden sm:inline opacity-90">
          — Customers and fundis cannot access the platform. Staff have full access.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/staff/system"
          className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
        >
          Disable <ExternalLink className="w-3 h-3" />
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
