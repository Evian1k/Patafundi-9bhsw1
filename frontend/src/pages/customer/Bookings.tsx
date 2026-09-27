import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BackBar from "@/components/layout/BackBar";
import { apiClient } from "@/lib/api";
import { bootstrapAuthSessionFromUser, resolveAuthRole } from "@/lib/authSession";

type JobRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  service_category?: string | null;
  status?: string | null;
  estimated_price?: number | string | null;
  location_name?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
};

type TabId = "active" | "scheduled" | "completed" | "cancelled" | "disputed";

const TABS: { id: TabId; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "scheduled", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "disputed", label: "Disputed" },
];

const ACTIVE_STATUSES = [
  "pending", "matching", "searching", "matched", "accepted",
  "on_the_way", "arrived", "in_progress", "awaiting_confirmation",
];

function classify(job: JobRow): TabId {
  const s = String(job.status || "").toLowerCase();
  if (s === "disputed" || s === "dispute_open") return "disputed";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "failed" || s === "expired") return "cancelled";
  if (s === "scheduled" || (!ACTIVE_STATUSES.includes(s) && job.scheduled_at)) return "scheduled";
  if (ACTIVE_STATUSES.includes(s)) return "active";
  return "completed";
}

const statusLabel = (s?: string | null) =>
  String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function JobCard({ job }: { job: JobRow }) {
  return (
    <Link
      to={`/job/${job.id}/tracking`}
      className="block bg-card rounded-2xl border border-border/60 p-4 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {job.title || job.service_category || "Service job"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {job.description || job.location_name || "No details provided"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted">{statusLabel(job.status)}</span>
          {job.estimated_price != null && (
            <span className="text-xs text-muted-foreground">KES {Number(job.estimated_price).toLocaleString()}</span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

export default function Bookings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("active");
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiClient.getUserJobs()) as { jobs?: JobRow[] };
      setJobs(res?.jobs ?? []);
    } catch {
      setError("Could not load your bookings. Please try again.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const userData = await apiClient.getCurrentUser();
        if (!active) return;
        bootstrapAuthSessionFromUser(userData.user);
        const role = resolveAuthRole(userData.user);
        if (role === "admin") { navigate("/admin/dashboard"); return; }
        if (role === "fundi") { navigate("/fundi"); return; }
        if (role === "fundi_pending") { navigate("/fundi/pending"); return; }
        if (String(userData.user?.role || "").toLowerCase() === "company_admin") { navigate("/company"); return; }
        load();
      } catch {
        if (active) navigate("/auth");
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const grouped = useMemo(() => {
    const map: Record<TabId, JobRow[]> = { active: [], scheduled: [], completed: [], cancelled: [], disputed: [] };
    (jobs || []).forEach((j) => map[classify(j)].push(j));
    return map;
  }, [jobs]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BackBar to="/dashboard" label="Home" className="mb-3" />
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display font-bold text-2xl">My Bookings</h1>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {jobs && (
                <span className={`ml-2 text-xs ${tab === t.id ? "text-white/80" : "text-muted-foreground"}`}>
                  {grouped[t.id].length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button variant="outline" onClick={load}>Try again</Button>
          </div>
        ) : grouped[tab].length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} bookings</p>
            <p className="text-sm text-muted-foreground mb-4">
              {tab === "active" ? "When you book a service, it will show up here." : "Nothing here yet — this fills up as you use PataFundi."}
            </p>
            <Link to="/create-job"><Button className="bg-gradient-primary">Book a service</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped[tab].map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}
