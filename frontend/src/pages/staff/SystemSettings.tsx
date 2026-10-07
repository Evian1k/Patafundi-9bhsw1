/**
 * Feature Flags + API Integrations admin page.
 * Super admin can toggle features and test API integrations.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ToggleLeft, ToggleRight, Plug, CheckCircle, XCircle, Zap } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SystemSettings() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [flags, setFlags] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, i] = await Promise.all([
        apiClient.request("/admin/feature-flags", { includeAuth: true }) as any,
        apiClient.request("/admin/integrations", { includeAuth: true }) as any,
      ]);
      setFlags(f.flags || []);
      setIntegrations(i.integrations || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") { navigate("/staff"); return; }
      } catch { navigate("/staff/login"); return; }
      fetchData();
    })();
  }, [navigate, fetchData]);

  const toggleFlag = async (key: string, current: boolean) => {
    try {
      await apiClient.request("/admin/feature-flags", {
        method: "PUT", body: JSON.stringify({ key, enabled: !current }), includeAuth: true,
      });
      setFlags(flags.map(f => f.key === key ? { ...f, is_enabled: !current } : f));
      toast.success(`${key} ${!current ? "enabled" : "disabled"}`);
    } catch { toast.error("Failed to toggle"); }
  };

  const testIntegration = async (service: string) => {
    try {
      const result = await apiClient.request(`/admin/integrations/${service}/test`, { method: "POST", includeAuth: true }) as any;
      if (result.configured) toast.success(`${service} is configured ✓`);
      else toast.error(`${service} not configured: ${result.missing?.join(", ")}`);
      fetchData();
    } catch { toast.error("Test failed"); }
  };

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Feature flags, API integrations, and platform controls</p>
        </motion.div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center justify-between gap-3">
            <span>System settings could not be loaded just now.</span>
            <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        )}

        {/* Feature Flags */}
        <motion.div variants={fadeUp} className="bg-card rounded-2xl p-6 shadow-sm border border-border/60 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ToggleRight className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Feature Flags</h2>
          </div>
          {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : flags.length === 0 ? (
            <p className="text-muted-foreground text-sm">No feature flags configured.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {flags.map(f => (
                <div key={f.key} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-foreground">{f.label}</div>
                    <div className="text-xs text-muted-foreground capitalize">{f.category}</div>
                  </div>
                  <button onClick={() => toggleFlag(f.key, f.is_enabled)} aria-label={`Toggle ${f.label}`} className="p-1">
                    {f.is_enabled
                      ? <ToggleRight className="w-8 h-8 text-green-500" />
                      : <ToggleLeft className="w-8 h-8 text-muted-foreground/40" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* API Integrations */}
        <motion.div variants={fadeUp} className="bg-card rounded-2xl p-6 shadow-sm border border-border/60">
          <div className="flex items-center gap-2 mb-4">
            <Plug className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">API Integrations</h2>
          </div>
          {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : integrations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No integrations registered.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {integrations.map(i => (
                <div key={i.service} className="p-3 bg-muted/40 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-foreground">{i.label}</div>
                    {i.is_connected
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${i.is_configured ? "text-green-600" : "text-muted-foreground"}`}>
                      {i.is_configured ? "Configured" : "Not configured"}
                    </span>
                    <button onClick={() => testIntegration(i.service)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Zap className="w-3 h-3" /> Test
                    </button>
                  </div>
                  {i.last_error && <p className="text-xs text-red-400 mt-1 truncate">{i.last_error}</p>}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
