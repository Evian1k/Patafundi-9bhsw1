/**
 * Staff role-specific dashboards (spec §13) — replaces the generic fallback
 * overview that dispatch/finance/fraud/audit/devops/support used to render.
 * Every widget calls real endpoints; role access is enforced server-side too.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, Banknote, DollarSign, Headphones, ScrollText,
  PackageCheck, Server, ShieldCheck, Users, Bug,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { realtimeService } from "@/services/realtime";

interface RoleHomeProps { role: string }

export default function StaffRoleHome({ role }: RoleHomeProps) {
  return (
    <div className="space-y-4">
      {role === "dispatch_team" && <DispatchHome />}
      {role === "finance_team" && <FinanceHome />}
      {role === "fraud_analyst" && <FraudHome />}
      {role === "auditor" && <AuditHome />}
      {role === "devops_engineer" && <DevopsHome />}
      {role === "support_agent" && <SupportHome />}
      {role === "admin" && <OpsHome />}
      {role === "super_admin" && <OpsHome />}
    </div>
  );
}

function useData<T>(paths: string[]) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: Record<string, unknown> = {};
      const errs: string[] = [];
      for (const p of paths) {
        try {
          const res = await apiClient.request(p);
          out[p] = res;
        } catch (e) {
          errs.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (!cancelled) { setData(out); setError(errs.length && Object.keys(out).length === 0 ? "Unable to load data. Check permissions." : null); setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, loading, error };
}

function StatCard({ label, value, icon: Icon, tone, sub }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tone: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ListCard({ title, items, emptyText, render }: {
  title: string; items: Record<string, unknown>[]; emptyText: string;
  render: (item: Record<string, unknown>, i: number) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <p className="px-4 py-3 border-b text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y max-h-96 overflow-y-auto">
          {items.slice(0, 12).map((it, i) => <div key={i} className="px-4 py-3 text-sm">{render(it, i)}</div>)}
        </div>
      )}
    </div>
  );
}

function chippify(status: string) {
  const map: Record<string, string> = {
    open: "bg-amber-500/10 text-amber-600", under_review: "bg-blue-500/10 text-blue-600",
    resolved: "bg-emerald-500/10 text-emerald-600", rejected: "bg-muted text-muted-foreground",
    pending: "bg-amber-500/10 text-amber-600", completed: "bg-emerald-500/10 text-emerald-600",
    failed: "bg-red-500/10 text-red-500", requested: "bg-blue-500/10 text-blue-600",
    processing: "bg-blue-500/10 text-blue-600", cancelled: "bg-muted text-muted-foreground",
    high: "bg-red-500/10 text-red-500", critical: "bg-red-500/10 text-red-500 font-semibold",
    medium: "bg-amber-500/10 text-amber-600", low: "bg-muted text-muted-foreground",
    in_progress: "bg-emerald-500/10 text-emerald-600", on_the_way: "bg-cyan-500/10 text-cyan-600",
    arrived: "bg-cyan-500/10 text-cyan-600", assigned: "bg-sky-500/10 text-sky-600",
    accepted: "bg-violet-500/10 text-violet-600", matching: "bg-blue-500/10 text-blue-600",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize whitespace-nowrap ${chippify(status)}`}>
      {String(status).replace(/_/g, " ")}
    </span>
  );
}

// ── DISPATCH ──
function DispatchHome() {
  const { data, loading, error } = useData<never>(["/staff/jobs?limit=50", "/fundi/search?limit=50"]);
  const jobs = (data["/staff/jobs?limit=50"] as { jobs?: Record<string, unknown>[] } | undefined)?.jobs || [];
  const fundis = (data["/fundi/search?limit=50"] as { fundis?: Record<string, unknown>[] } | undefined)?.fundis || [];
  const active = jobs.filter((j) => ["assigned", "on_the_way", "arrived", "in_progress", "accepted"].includes(String(j.status)));
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  return (
    <>
      <Header title="Dispatch" subtitle="Active jobs and provider availability across the platform." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active jobs" value={active.length} icon={Activity} tone="text-cyan-600 bg-cyan-500/10" />
        <StatCard label="Online fundis" value={fundis.length} icon={Users} tone="text-emerald-600 bg-emerald-500/10" />
        <StatCard label="Total jobs" value={jobs.length} icon={PackageCheck} tone="text-sky-600 bg-sky-500/10" />
        <StatCard label="Emergencies" value={jobs.filter((j) => j.urgency === "emergency").length} icon={AlertTriangle} tone="text-red-600 bg-red-500/10" />
      </div>
      <ListCard title="Active jobs" items={active} emptyText="No active jobs right now."
        render={(j) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium capitalize truncate">{String(j.category || j.service_category || "service").replace(/_/g, " ")} · {String(j.location_name || "")}</p>
              <p className="text-xs text-muted-foreground">{new Date(String(j.created_at)).toLocaleString()}</p>
            </div>
            <Chip status={String(j.status)} />
          </div>
        )} />
    </>
  );
}

// ── FINANCE ──
function FinanceHome() {
  const { data, loading, error } = useData<never>(["/staff/payments?limit=50", "/admin/payouts?limit=50"]);
  const payments = (data["/staff/payments?limit=50"] as { payments?: Record<string, unknown>[] } | undefined)?.payments
    || (data["/staff/payments?limit=50"] as { items?: Record<string, unknown>[] } | undefined)?.items || [];
  const payouts = (data["/admin/payouts?limit=50"] as { payouts?: Record<string, unknown>[] } | undefined)?.payouts || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  const escrowHeld = payments.filter((p) => p.escrow_status === "held");
  return (
    <>
      <Header title="Finance" subtitle="Payments, escrow and payouts. Values are server-computed." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Payments (recent)" value={payments.length} icon={DollarSign} tone="text-emerald-600 bg-emerald-500/10" />
        <StatCard label="Escrow held" value={escrowHeld.length} icon={Banknote} tone="text-amber-600 bg-amber-500/10" />
        <StatCard label="Payouts" value={payouts.length} icon={Banknote} tone="text-sky-600 bg-sky-500/10" />
        <StatCard label="Payouts pending" value={payouts.filter((p) => ["requested", "processing"].includes(String(p.status))).length} icon={Banknote} tone="text-orange-600 bg-orange-500/10" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ListCard title="Recent payments" items={payments} emptyText="No payments yet."
          render={(p, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{formatMoney(p.amount)} · {String(p.provider || "")}</p>
                <p className="text-xs text-muted-foreground">{new Date(String(p.created_at)).toLocaleString()}</p>
              </div>
              <Chip status={String(p.status || "")} />
            </div>
          )} />
        <ListCard title="Payouts" items={payouts} emptyText="No payouts yet."
          render={(p, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <p className="font-medium">{formatMoney(p.amount ?? p.net_amount)}</p>
              <Chip status={String(p.status || "")} />
            </div>
          )} />
      </div>
    </>
  );
}

// ── FRAUD ──
function FraudHome() {
  // /staff/fraud/dashboard is permission-scoped (can_view_fraud_dashboard) so
  // fraud_analysts pass; /admin/fraud/dashboard is admin-role-only.
  const { data, loading, error } = useData<never>(["/staff/fraud/alerts?limit=50", "/staff/fraud/dashboard"]);
  const alerts = (data["/staff/fraud/alerts?limit=50"] as { alerts?: Record<string, unknown>[] } | undefined)?.alerts || [];
  const dashboard = (data["/staff/fraud/dashboard"] as { dashboard?: { fraudAlerts?: { open?: number; critical?: number; total?: number }; fraudScores?: { monitored?: number }; suspiciousJobs?: number } } | undefined)?.dashboard;
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  return (
    <>
      <Header title="Fraud & risk" subtitle="Alerts, suspicious activity and risk signals." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open alerts" value={alerts.filter((a) => !["resolved", "dismissed"].includes(String(a.status))).length} icon={AlertTriangle} tone="text-red-600 bg-red-500/10" />
        <StatCard label="Alerts (30d)" value={dashboard?.fraudAlerts?.total ?? alerts.length} icon={AlertTriangle} tone="text-amber-600 bg-amber-500/10" sub={`${dashboard?.fraudAlerts?.critical ?? 0} critical`} />
        <StatCard label="High severity" value={alerts.filter((a) => ["high", "critical"].includes(String(a.severity))).length} icon={AlertTriangle} tone="text-red-600 bg-red-500/10" />
        <StatCard label="Monitored users" value={dashboard?.fraudScores?.monitored ?? 0} icon={ShieldCheck} tone="text-emerald-600 bg-emerald-500/10" />
      </div>
      <ListCard title="Alerts" items={alerts} emptyText="No fraud alerts. All clear."
        render={(a) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{String(a.alert_type || a.type || "alert")}</p>
              <p className="text-xs text-muted-foreground truncate">{String(a.description || a.detail || "")}</p>
            </div>
            <Chip status={String(a.severity || a.status || "")} />
          </div>
        )} />
    </>
  );
}

// ── AUDITOR ──
function AuditHome() {
  const { data, loading, error } = useData<never>(["/staff/audit-logs?limit=60"]);
  const logs = (data["/staff/audit-logs?limit=60"] as { logs?: Record<string, unknown>[]; items?: Record<string, unknown>[] } | undefined)?.logs
    || (data["/staff/audit-logs?limit=60"] as { items?: Record<string, unknown>[] } | undefined)?.items || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  return (
    <>
      <Header title="Audit" subtitle="Sensitive actions and security events (read-only)." />
      <ListCard title="Recent audit events" items={logs} emptyText="No audit events recorded."
        render={(l, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{String(l.action || "event")}</p>
              <p className="text-xs text-muted-foreground truncate">{String(l.entity_type || "")} {String(l.entity_id || "").slice(0, 8)} · {new Date(String(l.created_at)).toLocaleString()}</p>
            </div>
          </div>
        )} />
    </>
  );
}

// ── DEVOPS ──
function DevopsHome() {
  const { data, loading, error } = useData<never>(["/health", "/health/extended", "/staff/error-logs?resolved=false&limit=100"]);
  const health = data["/health"] as Record<string, unknown> | undefined;
  const extended = data["/health/extended"] as { db?: { ok?: boolean } } | undefined;
  const errorLogs = (data["/staff/error-logs?resolved=false&limit=100"] as { errors?: Record<string, unknown>[] } | undefined)?.errors || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  // /health/extended runs a live DB query — a 200 with db.ok means connected.
  // /health only answers when the API itself is up, so its presence IS the
  // "Operational" signal. Realtime shows the actual socket state.
  const apiOk = !!health;
  const dbOk = extended?.db?.ok === true || !!health?.dbTime;
  const realtimeOk = realtimeService.connected;
  const criticalErrors = errorLogs.filter((e) => Number(e.status_code) >= 500).length;
  return (
    <>
      <Header title="System health" subtitle="Service status and error triage." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="API" value={apiOk ? "Operational" : "Down"} icon={Server} tone={apiOk ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10"} />
        <StatCard label="Database" value={dbOk ? "Connected" : "Down"} icon={Server} tone={dbOk ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10"} />
        <StatCard label="Unresolved errors" value={errorLogs.length} icon={Bug} tone={errorLogs.length > 0 ? "text-amber-600 bg-amber-500/10" : "text-emerald-600 bg-emerald-500/10"} sub={`${criticalErrors} critical (5xx)`} />
        <StatCard label="Realtime" value={realtimeOk ? "Live" : "Polling"} icon={Activity} tone={realtimeOk ? "text-violet-600 bg-violet-500/10" : "text-muted-foreground bg-muted"} />
      </div>
      <Link
        to="/staff/devops/errors"
        className="flex items-center justify-between rounded-2xl border bg-card p-4 text-sm hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">Error Logs</span>
          <span className="text-muted-foreground">- full technical detail users never see, searchable by reference code</span>
        </span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </>
  );
}

// ── SUPPORT ──
function SupportHome() {
  const { data, loading, error } = useData<never>(["/staff/disputes?limit=50"]);
  const disputes = (data["/staff/disputes?limit=50"] as { disputes?: Record<string, unknown>[] } | undefined)?.disputes || [];
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  return (
    <>
      <Header title="Support" subtitle="Disputes and customer issues." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open disputes" value={disputes.filter((d) => ["open", "under_review"].includes(String(d.status))).length} icon={Headphones} tone="text-amber-600 bg-amber-500/10" />
        <StatCard label="Resolved" value={disputes.filter((d) => String(d.status) === "resolved").length} icon={ShieldCheck} tone="text-emerald-600 bg-emerald-500/10" />
        <StatCard label="SLA at risk" value={disputes.filter((d) => d.sla_deadline && new Date(String(d.sla_deadline)) < new Date()).length} icon={AlertTriangle} tone="text-red-600 bg-red-500/10" />
        <StatCard label="Total" value={disputes.length} icon={Headphones} tone="text-sky-600 bg-sky-500/10" />
      </div>
      <ListCard title="Disputes" items={disputes} emptyText="No disputes. Customers are happy."
        render={(d) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{String(d.reason || "dispute")}</p>
              <p className="text-xs text-muted-foreground truncate">{new Date(String(d.created_at)).toLocaleString()}</p>
            </div>
            <Chip status={String(d.status || "")} />
          </div>
        )} />
    </>
  );
}

// ── OPS ──
function OpsHome() {
  const { data, loading, error } = useData<never>(["/admin/dashboard"]);
  const dash = data["/admin/dashboard"] as Record<string, unknown> | undefined;
  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBox message={error} />;
  const stats = (dash?.stats || dash || {}) as Record<string, unknown>;
  const num = (k: string) => {
    const v = stats[k];
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return (
    <>
      <Header title="Operations" subtitle="Platform-wide operational picture." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total users" value={num("totalUsers")} icon={Users} tone="text-sky-600 bg-sky-500/10" />
        <StatCard label="Active jobs" value={num("activeJobs")} icon={Activity} tone="text-cyan-600 bg-cyan-500/10" />
        <StatCard label="Completed jobs" value={num("completedJobs")} icon={PackageCheck} tone="text-emerald-600 bg-emerald-500/10" />
        <StatCard label="Revenue" value={formatMoney(num("totalRevenue"))} icon={DollarSign} tone="text-amber-600 bg-amber-500/10" />
      </div>
      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        <ScrollText className="h-4 w-4 inline mr-1.5 text-emerald-600" />
        Use the sidebar for jobs, fundis, users, disputes and audit logs. All views are permission-scoped server-side.
      </div>
    </>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 w-48 rounded-xl bg-muted animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
      </div>
      <div className="h-40 rounded-2xl bg-muted animate-pulse" />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border bg-red-500/5 p-6 text-sm text-red-600">
      {message}{" "}
      <Link to="/staff/login" className="underline">Sign in again</Link>
    </div>
  );
}
