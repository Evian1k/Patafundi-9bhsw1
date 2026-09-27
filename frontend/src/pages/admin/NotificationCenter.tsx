/**
 * Admin Notification Center (spec sections 43, 44).
 * - Categories: All / Critical / Verification / Companies / Fundis /
 *   Customers / Payments / Disputes / System / Security
 * - Every notification shows title, message, severity, timestamp, read state.
 * - Click-through navigates to the actual related record (job, company,
 *   application, dispute, payment) and critical system errors deep-link into
 *   Staff Portal -> DevOps -> Error Logs with the reference code pre-filtered.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, BellRing, Briefcase, CheckCheck, ChevronRight,
  FileWarning, Loader2, RefreshCw, Shield, ShieldAlert, Users, Wrench,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import BackBar from "@/components/layout/BackBar";

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  category: string | null;
  severity: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "verification", label: "Verification" },
  { key: "companies", label: "Companies" },
  { key: "fundis", label: "Fundis" },
  { key: "customers", label: "Customers" },
  { key: "payments", label: "Payments" },
  { key: "disputes", label: "Disputes" },
  { key: "system", label: "System" },
  { key: "security", label: "Security" },
];

function categoryIcon(n: AdminNotification) {
  const type = `${n.type} ${n.title}`.toLowerCase();
  if (n.severity === "critical" || type.includes("error")) return FileWarning;
  if (n.category === "security" || type.includes("fraud") || type.includes("security")) return ShieldAlert;
  if (n.category === "verification") return Shield;
  if (n.category === "payments") return Briefcase;
  if (n.category === "fundis") return Wrench;
  if (n.category === "companies" || type.includes("company")) return Users;
  return BellRing;
}

/** Resolve the admin record a notification points at (spec section 43). */
function targetFor(n: AdminNotification): string | null {
  const d = n.data || {};
  const reference = typeof d.reference === "string" ? d.reference : null;
  if (reference && /^ERR-/i.test(reference)) {
    return `/staff/devops/errors?ref=${encodeURIComponent(reference.toUpperCase())}`;
  }
  if (typeof d.jobId === "string") return `/admin/jobs?job=${d.jobId}`;
  if (typeof d.companyId === "string") return `/admin/companies/${d.companyId}`;
  if (typeof d.applicationId === "string") return `/admin/companies?application=${d.applicationId}`;
  if (typeof d.disputeId === "string") return `/admin/disputes?dispute=${d.disputeId}`;
  if (typeof d.paymentId === "string") return `/admin/payments?payment=${d.paymentId}`;
  if (typeof d.refundId === "string") return `/admin/refunds?refund=${d.refundId}`;
  if (typeof d.userId === "string") return `/admin/customers?user=${d.userId}`;
  return null;
}

function severityChip(severity: string | null) {
  const s = severity || "normal";
  const cls: Record<string, string> = {
    critical: "bg-red-500/10 text-red-600",
    high: "bg-amber-500/10 text-amber-600",
    normal: "bg-muted text-muted-foreground",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls[s] || cls.normal}`}>
      {s}
    </span>
  );
}

export default function AdminNotificationCenter() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(params.get("category") || "all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.request("/notifications?limit=100") as { notifications?: AdminNotification[] };
      setItems(res.notifications || []);
    } catch {
      setError("Could not load notifications. Try again.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    try {
      await apiClient.request("/notifications/read-all", { method: "PATCH" });
      await load();
    } catch {
      // non-fatal
    }
  };

  const filtered = useMemo(() => {
    const list = items || [];
    if (category === "all") return list;
    if (category === "critical") return list.filter((n) => n.severity === "critical");
    return list.filter((n) => (n.category || "system") === category);
  }, [items, category]);

  const open = (n: AdminNotification) => {
    const target = targetFor(n);
    if (target) {
      navigate(target);
      return;
    }
    if (!n.read_at) {
      apiClient.request(`/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
      setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <BackBar to="/admin/dashboard" label="Admin" className="mb-3" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notification center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Critical events from verification, companies, payments, disputes and the platform itself.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={markAllRead} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mb-1">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                category === c.key ? "bg-primary text-primary-foreground border-primary font-medium" : "hover:bg-muted"}`}>
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 space-y-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border bg-red-500/5 text-sm px-4 py-3 text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl border bg-card p-10 text-center">
            <BellRing className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing here yet. Events appear as companies apply, disputes open, payments fail or the system detects problems.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((n) => {
              const Icon = categoryIcon(n);
              const target = targetFor(n);
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  onClick={() => open(n)}
                  className={`w-full text-left rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 ${unread ? "border-l-4 border-l-primary" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      n.severity === "critical" ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{n.title}</p>
                        {severityChip(n.severity)}
                        {n.category && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{n.category}</span>
                        )}
                      </div>
                      {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {target ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary shrink-0 self-center">
                        Open <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    ) : unread ? (
                      <span className="h-2 w-2 rounded-full bg-primary self-center" aria-label="Unread" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          Critical system errors deep-link into
          <Link to="/staff/devops/errors" className="text-primary underline underline-offset-2">DevOps Error Logs</Link>
          with the error reference pre-filtered.
        </div>
      </div>
    </div>
  );
}
