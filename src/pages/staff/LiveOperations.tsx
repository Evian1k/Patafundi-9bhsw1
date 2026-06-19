/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Live Operations Center — shows online fundis + active jobs on a map.
 * Staff with can_view_all_jobs permission can see this.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, Wrench, Briefcase, RefreshCw, MapPin } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";

export default function LiveOperations() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [fundis, setFundis] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fundiData, jobData] = await Promise.all([
        apiClient.request("/fundi/search?limit=50", { includeAuth: true }) as any,
        apiClient.request("/staff/jobs?limit=50", { includeAuth: true }) as any,
      ]);
      setFundis(fundiData.fundis || []);
      setJobs(jobData.jobs || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        const staffRoles = ["super_admin", "admin", "dispatch_team", "support_agent"];
        if (!staffRoles.includes(me?.user?.role)) { navigate("/staff"); return; }
      } catch { navigate("/staff/login"); return; }
      fetchData();
      const interval = setInterval(fetchData, 15_000);
      return () => clearInterval(interval);
    })();
  }, [navigate, fetchData]);

  const onlineFundis = fundis.filter((f) => f.latitude && f.longitude);
  const activeJobs = jobs.filter((j) => !["completed", "cancelled", "failed"].includes(j.status));

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Operations Center</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time view of online fundis and active jobs</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh (auto every 15s)
          </Button>
        </motion.div>

        {/* Stat cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
              <Wrench className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{onlineFundis.length}</div>
            <div className="text-xs text-slate-500">Online Fundis</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
              <Briefcase className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{activeJobs.length}</div>
            <div className="text-xs text-slate-500">Active Jobs</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{jobs.length}</div>
            <div className="text-xs text-slate-500">Total Jobs (50 max)</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{onlineFundis.filter(f => f.distanceKm != null).length}</div>
            <div className="text-xs text-slate-500">Fundis with GPS</div>
          </div>
        </motion.div>

        {/* Online Fundis list */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-green-600" /> Online Fundis ({onlineFundis.length})
              </h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-slate-400">Loading…</div>
              ) : onlineFundis.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No fundis online</div>
              ) : (
                onlineFundis.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-3 border-b border-slate-50">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{f.name}</div>
                      <div className="text-xs text-slate-500">
                        {f.skills?.join(", ") || "General"} · ⭐ {f.rating || "New"} · {f.qualityTier || "bronze"}
                      </div>
                    </div>
                    {f.distanceKm != null && (
                      <div className="text-xs text-slate-400">{f.distanceKm.toFixed(1)}km</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Jobs list */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-orange-600" /> Active Jobs ({activeJobs.length})
              </h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-slate-400">Loading…</div>
              ) : activeJobs.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No active jobs</div>
              ) : (
                activeJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-3 p-3 border-b border-slate-50">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate capitalize">
                        {job.service_category || job.serviceCategory}
                      </div>
                      <div className="text-xs text-slate-500">
                        {job.customerName || "Customer"} · {job.status}
                      </div>
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      job.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      job.status === "accepted" ? "bg-green-100 text-green-700" :
                      job.status === "on_the_way" ? "bg-purple-100 text-purple-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {job.status?.replace(/_/g, " ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
