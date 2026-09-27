/**
 * Error Logs — staff viewer for system + client-reported errors.
 *
 * Every error users hit is sanitized on the backend: they only see a friendly
 * message plus a short reference code (e.g. ERR-7F3K2Q). The full technical
 * detail lands HERE, routed to the staff roles responsible (devops_engineer,
 * super_admin; payment → finance_team; fraud → fraud_analyst via notifications).
 *
 * Permission: enforced server-side via requirePermission('can_view_logs').
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Filter, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";

interface ErrorLog {
  id: string;
  error_type: string;
  status_code: number;
  message: string;
  stack_trace: string | null;
  path: string | null;
  method: string | null;
  reference: string | null;
  source: string;
  user_role: string | null;
  resolved: boolean;
  created_at: string;
}

const TYPE_FILTERS = ["all", "system", "database", "payment", "security", "fraud", "client", "rate_limit", "general"] as const;

function typeBadge(type: string) {
  const map: Record<string, string> = {
    database: "bg-red-500/10 text-red-600",
    system: "bg-red-500/10 text-red-500",
    payment: "bg-amber-500/10 text-amber-600",
    security: "bg-violet-500/10 text-violet-600",
    fraud: "bg-orange-500/10 text-orange-600",
    client: "bg-cyan-500/10 text-cyan-600",
    rate_limit: "bg-blue-500/10 text-blue-600",
    general: "bg-muted text-muted-foreground",
  };
  return map[type] || "bg-muted text-muted-foreground";
}

export default function ErrorLogs() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [resolvedFilter, setResolvedFilter] = useState<string>("false");
  const [referenceQuery, setReferenceQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("ref") || "";
    } catch {
      return "";
    }
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (resolvedFilter !== "all") params.set("resolved", resolvedFilter);
      if (referenceQuery.trim()) params.set("reference", referenceQuery.trim());
      const res = await apiClient.request(`/staff/error-logs?${params.toString()}`) as { errors?: ErrorLog[] };
      setErrors(res.errors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load error logs. Check your permissions.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, resolvedFilter, referenceQuery]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string) => {
    setResolving(id);
    try {
      await apiClient.request(`/staff/error-logs/${id}/resolve`, { method: "POST" });
      setErrors((prev) => prev.map((e) => (e.id === id ? { ...e, resolved: true } : e)));
    } catch {
      // non-blocking — row stays unresolved, staff can retry
    } finally {
      setResolving(null);
    }
  };

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Error Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Technical detail users never see. Reference codes match what users quote to support.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reference code (e.g. ERR-7F3K2Q)"
              value={referenceQuery}
              onChange={(e) => setReferenceQuery(e.target.value)}
              className="pl-8 font-mono"
            />
          </div>
          <select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Resolved filter"
          >
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
            <option value="all">All states</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                typeFilter === t ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t === "all" ? "All types" : t.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && (
        <p className="text-xs text-muted-foreground">
          {errors.length} error{errors.length === 1 ? "" : "s"} shown · {unresolvedCount} unresolved
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border bg-red-500/5 p-6 text-sm text-red-600">{error}</div>
      ) : errors.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
          <p className="text-sm font-medium">No errors match this filter.</p>
          <p className="text-xs text-muted-foreground mt-1">A clean log means the platform is healthy.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y">
          {errors.map((e) => (
            <div key={e.id} className="p-4">
              <button
                className="w-full text-left flex items-start justify-between gap-3"
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {e.reference && (
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-muted">{e.reference}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${typeBadge(e.error_type)}`}>
                      {e.error_type.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.method || "GET"} {e.path || "/"} · HTTP {e.status_code}
                    </span>
                    {e.source === "client" && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] bg-cyan-500/10 text-cyan-600">frontend</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground truncate">{e.message}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {new Date(e.created_at).toLocaleString()}
                    {e.user_role ? ` · role: ${e.user_role}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {e.resolved ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-500/10 text-emerald-600">resolved</span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded-full px-2 py-0.5 text-[11px] bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 cursor-pointer"
                      onClick={(ev) => { ev.stopPropagation(); resolve(e.id); }}
                      onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); resolve(e.id); } }}
                    >
                      {resolving === e.id ? "…" : "mark resolved"}
                    </span>
                  )}
                </div>
              </button>
              {expanded === e.id && e.stack_trace && (
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                  {e.stack_trace}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
