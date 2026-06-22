/**
 * Feature Flags + API Integrations admin page.
 * Super admin can toggle features and test API integrations.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ToggleLeft, ToggleRight, Plug, CheckCircle, XCircle, Zap, Wrench } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { toast } from "sonner";

export default function SystemSettings() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [flags, setFlags] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, i] = await Promise.all([
        apiClient.request("/admin/feature-flags", { includeAuth: true }) as any,
        apiClient.request("/admin/integrations", { includeAuth: true }) as any,
      ]);
      setFlags(f.flags || []);
      setIntegrations(i.integrations || []);
    } catch { /* ignore */ }
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
          <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Feature flags, API integrations, and platform controls</p>
        </motion.div>

        {/* Feature Flags */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ToggleRight className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-slate-900">Feature Flags</h2>
          </div>
          {loading ? <p className="text-slate-400 text-sm">Loading…</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {flags.map(f => (
                <div key={f.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{f.label}</div>
                    <div className="text-xs text-slate-500 capitalize">{f.category}</div>
                  </div>
                  <button onClick={() => toggleFlag(f.key, f.is_enabled)} className="p-1">
                    {f.is_enabled
                      ? <ToggleRight className="w-8 h-8 text-green-500" />
                      : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* API Integrations */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Plug className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-slate-900">API Integrations</h2>
          </div>
          {loading ? <p className="text-slate-400 text-sm">Loading…</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {integrations.map(i => (
                <div key={i.service} className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-slate-900">{i.label}</div>
                    {i.is_connected
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-slate-300" />}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${i.is_configured ? "text-green-600" : "text-slate-400"}`}>
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

        {/* Scheduled Maintenance */}
        <MaintenanceScheduleSection />
      </motion.div>
    </div>
  );
}

// ── Scheduled Maintenance Section ──────────────────────────────────
function MaintenanceScheduleSection() {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.request("/admin/maintenance/schedule", { includeAuth: true }) as any;
      setSchedule(res.schedule);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const update = (key: string, value: any) => setSchedule((s: any) => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.request("/admin/maintenance/schedule", {
        method: "PUT", body: JSON.stringify(schedule), includeAuth: true,
      });
      toast.success("Maintenance schedule saved");
    } catch { toast.error("Failed to save schedule"); }
    finally { setSaving(false); }
  };

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="w-5 h-5 text-amber-500" />
        <h2 className="font-semibold text-slate-900">Scheduled Maintenance</h2>
      </div>
      {loading || !schedule ? <p className="text-slate-400 text-sm">Loading…</p> : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Automatically enables maintenance mode on a recurring schedule. Customers and fundis
            see the maintenance page; staff have full access and can log in to maintain the system.
          </p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-900">Enable Scheduled Maintenance</p>
              <p className="text-xs text-slate-500">Auto-toggle maintenance on the schedule below</p>
            </div>
            <button onClick={() => update("enabled", !schedule.enabled)} className="p-1">
              {schedule.enabled
                ? <ToggleRight className="w-8 h-8 text-green-500" />
                : <ToggleLeft className="w-8 h-8 text-slate-300" />}
            </button>
          </div>

          {/* Day of week */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Day of week</label>
            <select
              value={schedule.dayOfWeek}
              onChange={e => update("dayOfWeek", parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>

          {/* Start hour + duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Start hour (0-23)</label>
              <input
                type="number" min={0} max={23}
                value={schedule.startHour}
                onChange={e => update("startHour", parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Duration (hours)</label>
              <input
                type="number" min={1} max={12}
                value={schedule.durationHours}
                onChange={e => update("durationHours", parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <strong>Next maintenance:</strong> {DAYS[schedule.dayOfWeek]} from{" "}
            {String(schedule.startHour).padStart(2, "0")}:00 to{" "}
            {String(schedule.startHour + schedule.durationHours).padStart(2, "0")}:00 ({schedule.timezone})
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
