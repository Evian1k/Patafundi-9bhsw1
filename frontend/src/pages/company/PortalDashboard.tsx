/**
 * Company portal dashboard (spec §9) — REAL data only.
 * Honest empty states; never manufactured numbers.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, BadgeCheck, Briefcase, CheckCircle2, Clock,
  Star, TrendingUp, UserCheck, Users, Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useOutletContext } from "react-router-dom";
import type { PortalMe } from "./CompanyPortalLayout";

interface Overview {
  company: { id: string; companyName: string; verificationStatus?: string };
  stats: Record<string, number>;
  recentJobs: {
    id: string; status: string; service_category: string; urgency: string;
    estimated_price?: string | number; created_at: string;
    customer_name?: string; technician_name?: string;
  }[];
  myRole: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  matching: "bg-blue-500/10 text-blue-600",
  accepted: "bg-violet-500/10 text-violet-600",
  assigned: "bg-sky-500/10 text-sky-600",
  on_the_way: "bg-cyan-500/10 text-cyan-600",
  arrived: "bg-cyan-500/10 text-cyan-600",
  in_progress: "bg-emerald-500/10 text-emerald-600",
  completion_requested: "bg-orange-500/10 text-orange-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-red-500/10 text-red-500",
  scheduled: "bg-indigo-500/10 text-indigo-500",
  offered: "bg-teal-500/10 text-teal-600",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize whitespace-nowrap ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function PortalDashboard() {
  const ctx = useOutletContext<PortalMe>();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/overview") as unknown as Overview;
        setData(res);
      } catch {
        setError("Unable to load dashboard. Try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-28 rounded-3xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
    );
  }

  const s = data.stats || {};
  const cards = [
    { label: "Incoming", value: s.incoming, icon: Clock, tone: "text-amber-600 bg-amber-500/10" },
    { label: "Awaiting dispatch", value: s.awaiting_dispatch, icon: UserCheck, tone: "text-violet-600 bg-violet-500/10" },
    { label: "Active jobs", value: s.active, icon: Activity, tone: "text-cyan-600 bg-cyan-500/10" },
    { label: "Awaiting confirmation", value: s.awaiting_confirmation, icon: BadgeCheck, tone: "text-orange-600 bg-orange-500/10" },
    { label: "Completed", value: s.completed, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "Available technicians", value: s.availableTechnicians, icon: Users, tone: "text-sky-600 bg-sky-500/10" },
    { label: "Rating", value: s.rating ? s.rating.toFixed(1) : "—", icon: Star, tone: "text-amber-600 bg-amber-500/10" },
    { label: "Pending settlements (KES)", value: (s.pendingSettlements ?? 0).toLocaleString(), icon: Wallet, tone: "text-emerald-600 bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {ctx.myRole === "owner" ? "owner" : ctx.myRole}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.company.companyName} · {ctx.company.verificationStatus === "approved" ? "Verified partner" : ctx.company.verificationStatus}
          </p>
        </div>
        <Link to="/company/jobs" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-700 w-fit">
          Open dispatch board <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value ?? 0}</p>
          </div>
        ))}
      </div>

      {(s.incoming ?? 0) + (s.awaiting_dispatch ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-amber-600" />
            <p className="text-sm">
              <span className="font-medium">{(s.incoming ?? 0) + (s.awaiting_dispatch ?? 0)} job(s)</span> need your attention.
            </p>
          </div>
          <Link to="/company/jobs?tab=incoming" className="text-sm font-medium text-emerald-600 inline-flex items-center gap-1">
            Review now <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <section aria-labelledby="recent-h">
        <div className="flex items-center justify-between mb-3">
          <h2 id="recent-h" className="text-lg font-semibold tracking-tight">Recent jobs</h2>
          <Link to="/company/jobs" className="text-sm text-emerald-600 inline-flex items-center gap-1">All jobs <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {data.recentJobs.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No jobs yet. Jobs from customers will appear here.</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card divide-y overflow-hidden">
            {data.recentJobs.map((j) => (
              <Link key={j.id} to="/company/jobs" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate capitalize">{j.service_category?.replace("_", " ")}</p>
                    {j.urgency === "emergency" && <span className="rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-2 py-0.5">EMERGENCY</span>}
                    <StatusChip status={j.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {j.customer_name || "Customer"}{j.technician_name ? ` · tech: ${j.technician_name}` : ""} · {new Date(j.created_at).toLocaleDateString()}
                  </p>
                </div>
                {j.estimated_price ? <p className="text-sm font-semibold tabular-nums shrink-0">KES {Number(j.estimated_price).toLocaleString()}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
