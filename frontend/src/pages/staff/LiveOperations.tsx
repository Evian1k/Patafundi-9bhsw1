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
import { realtimeService } from "@/services/realtime";

export default function LiveOperations() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [fundis, setFundis] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pollDisabled, setPollDisabled] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fundiData, jobData] = await Promise.all([
        apiClient.request("/fundi/search?limit=50", { includeAuth: true }) as any,
        apiClient.request("/staff/jobs?limit=50", { includeAuth: true }) as any,
      ]);
      setFundis(fundiData.fundis || []);
      setJobs(jobData.jobs || []);
      setLoadError(false);
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status === 403 || status === 401) {
        // Permission denied or token expired — STOP polling entirely.
        // Don't retry, don't loop. The user needs to re-login or they
        // don't have permission for this page.
        setPollDisabled(true);
        return;
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        const staffRoles = ["super_admin", "admin", "dispatch_team", "support_agent"];
        if (!staffRoles.includes((me as { user?: { role?: string } } | null)?.user?.role || "")) {
          navigate("/staff");
          return;
        }
      } catch {
        navigate("/staff/login");
        return;
      }
      if (!cancelled) fetchData();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Auto-refresh every 15s unless auth/permission failures stopped polling.
  // A quiet platform must still stay live — an empty first load is not a
  // reason to freeze updates.
  useEffect(() => {
    if (pollDisabled) return;
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollDisabled]);

  // Realtime refresh (spec §34): live metric updates on job and payment
  // events instead of waiting for the next poll tick.
  useEffect(() => {
    const events = ["job:created", "job:accepted", "job:completed", "payment:confirmed", "payment:failed"];
    const handler = () => fetchData();
    events.forEach((e) => realtimeService.on(e, handler));
    return () => events.forEach((e) => realtimeService.off(e, handler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, fundis.length, jobs.length]);

  const onlineFundis = fundis.filter((f) => f.latitude && f.longitude);
  const activeJobs = jobs.filter((j) => !"completed cancelled failed expired".split(" ").includes(j.status));
  const completedInView = jobs.filter((j) => ["completed", "closed"].includes(j.status)).length;

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Live Operations Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time view of online fundis and active jobs</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh (auto every 15s)
          </Button>
        </motion.div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center justify-between gap-3">
            <span>Live data could not be refreshed just now - lists below may be stale.</span>
            <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        )}
        {pollDisabled && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Your session or permissions do not allow live operations polling. Sign in again with a dispatch-capable staff account.
          </div>
        )}

        {/* Stat cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/60">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
              <Wrench className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{onlineFundis.length}</div>
            <div className="text-xs text-muted-foreground">Online Fundis</div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/60">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3">
              <Briefcase className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{activeJobs.length}</div>
            <div className="text-xs text-muted-foreground">Active Jobs</div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/60">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{jobs.length}</div>
            <div className="text-xs text-muted-foreground">Total Jobs (50 max)</div>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/60">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{completedInView}</div>
            <div className="text-xs text-muted-foreground">Completed (in view)</div>
          </div>
        </motion.div>

        {/* Online Fundis list */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-green-600" /> Online Fundis ({onlineFundis.length})
              </h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">Loading…</div>
              ) : onlineFundis.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No fundis online</div>
              ) : (
                onlineFundis.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-3 border-b border-border/40">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.skills?.join(", ") || "General"} · ⭐ {f.rating || "New"} · {f.qualityTier || "bronze"}
                      </div>
                    </div>
                    {f.distanceKm != null && (
                      <div className="text-xs text-muted-foreground">{f.distanceKm.toFixed(1)}km</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Jobs list */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-orange-600" /> Active Jobs ({activeJobs.length})
              </h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">Loading…</div>
              ) : activeJobs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No active jobs</div>
              ) : (
                activeJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-3 p-3 border-b border-border/40">
                    <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* /staff/jobs maps the field to `category` — serviceCategory never exists. */}
                      <div className="text-sm font-medium text-foreground truncate capitalize">
                        {job.category || "Job"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.customerName || "Customer"} · {job.bookingNumber || job.booking_number || ""}
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
