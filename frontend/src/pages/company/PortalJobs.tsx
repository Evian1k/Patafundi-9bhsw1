/**
 * Company Jobs & Dispatch board (spec §10).
 * Tabs: Incoming · Dispatch · Open pool · Active · Awaiting confirmation · Completed.
 * Actions: accept / reject / quote / assign-technician / unassign — all via
 * server-authorized endpoints (requireCompanyMember + dispatch roles).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, Layers, Loader2, MapPin, RefreshCw, Send, UserCheck, XCircle } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useModalA11y } from "@/lib/a11y";
import { StatusChip } from "./PortalDashboard";

interface PortalJob {
  id: string; status: string; provider_type: string; service_category: string;
  description?: string; urgency: string; location_name?: string;
  estimated_price?: string | number; final_price?: string | number;
  scheduled_at?: string; created_at: string;
  customer_name?: string; customer_phone?: string; technician_name?: string;
  property_label?: string; property_address?: string;
}
interface TeamMember { id: string; fullName: string; role: string; status: string; isAvailable: boolean; activeJobs: number; skills: string[] }

const TABS = [
  { key: "incoming", label: "Incoming" },
  { key: "dispatch", label: "Dispatch" },
  { key: "pool", label: "Open pool" },
  { key: "active", label: "Active" },
  { key: "awaiting_confirmation", label: "To confirm" },
  { key: "completed", label: "Completed" },
];

export default function PortalJobs() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "incoming";
  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quoteFor, setQuoteFor] = useState<PortalJob | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const quoteDialogRef = useModalA11y(Boolean(quoteFor), () => setQuoteFor(null));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "pool") {
        const res = await apiClient.request("/company/portal/open-pool") as { jobs?: PortalJob[] };
        setJobs(res.jobs || []);
      } else {
        const res = await apiClient.request(`/company/portal/jobs?scope=${tab}`) as { jobs?: PortalJob[] };
        setJobs(res.jobs || []);
      }
      const teamRes = await apiClient.request("/company/portal/team") as { team?: TeamMember[] };
      setTeam((teamRes.team || []).filter((m) => m.role === "technician" && m.status === "active"));
    } catch {
      setError("Unable to load jobs. Try again.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (jobId: string, path: string, body?: Record<string, unknown>, okMsg = "Done") => {
    setBusyJob(jobId + path); setNotice(null);
    try {
      await apiClient.request(`/company/jobs/${jobId}/${path}`, { method: "POST", ...(body ? { body } : {}) });
      setNotice(okMsg);
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyJob(null);
    }
  };

  const sendQuote = async () => {
    if (!quoteFor) return;
    await act(quoteFor.id, "quote", { amount: Number(quoteAmount) }, "Quote sent to customer");
    setQuoteFor(null); setQuoteAmount("");
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs & dispatch</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receive jobs, quote, and assign your technicians.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted w-fit">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setParams({ tab: t.key })}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground border-emerald-600 font-medium" : "hover:bg-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mt-3 rounded-xl border bg-primary/100/5 text-sm px-3 py-2 text-primary">{notice}</div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-card p-10 text-center">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {tab === "pool" ? "No open jobs in your service categories right now." :
             tab === "incoming" ? "No incoming jobs yet. New customer requests will appear here." :
             "Nothing here right now."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((j) => (
            <div key={j.id} className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-medium capitalize">{j.service_category?.replace("_", " ")}</h2>
                    {j.urgency === "emergency" && (
                      <span className="rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-2 py-0.5">EMERGENCY</span>
                    )}
                    <StatusChip status={j.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{j.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {j.customer_name && <span>Customer: {j.customer_name}</span>}
                    {j.location_name && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.property_label || j.location_name}</span>}
                    {j.scheduled_at && <span>Scheduled: {new Date(j.scheduled_at).toLocaleString()}</span>}
                    {j.technician_name && <span className="inline-flex items-center gap-1 text-primary"><UserCheck className="h-3 w-3" />{j.technician_name}</span>}
                    <span>{new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {j.estimated_price ? (
                    <p className="font-semibold tabular-nums">KES {Number(j.estimated_price).toLocaleString()}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No estimate yet</p>
                  )}
                  {j.final_price ? <p className="text-xs text-muted-foreground">final: KES {Number(j.final_price).toLocaleString()}</p> : null}
                </div>
              </div>

              {/* Row actions per lifecycle state */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(j.status === "pending" || j.status === "matching" || j.status === "scheduled") && (tab === "incoming" || tab === "pool") && (
                  <>
                    <button disabled={busyJob === j.id + "accept"} onClick={() => act(j.id, tab === "pool" ? "claim" : "accept", undefined, "Job accepted")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {busyJob === j.id + "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                      {tab === "pool" ? "Claim job" : "Accept job"}
                    </button>
                    <button disabled={busyJob === j.id + "quote"} onClick={() => { setQuoteFor(j); setQuoteAmount(String(j.estimated_price ? Number(j.estimated_price) : "")); }}
                      className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm hover:bg-muted disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" /> Send quote
                    </button>
                    {tab === "incoming" && (
                      <button disabled={busyJob === j.id + "reject"} onClick={() => act(j.id, "reject", { reason: "Declined by company" }, "Job declined")}
                        className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm text-red-600 hover:bg-red-500/5 disabled:opacity-50">
                        <XCircle className="h-3.5 w-3.5" /> Decline
                      </button>
                    )}
                  </>
                )}
                {["accepted", "offered"].includes(j.status) && (
                  <>
                    <SelectTechnician
                      key={j.id + team.length}
                      team={team}
                      busy={busyJob === j.id + "assign-technician"}
                      onAssign={(memberId, name) => act(j.id, "assign-technician", { technicianMemberId: memberId }, `Assigned to ${name}`)}
                    />
                    <button disabled={busyJob === j.id + "quote"} onClick={() => { setQuoteFor(j); setQuoteAmount(String(Number(j.estimated_price || 0))); }}
                      className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm hover:bg-muted disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" /> Update quote
                    </button>
                  </>
                )}
                {["assigned", "on_the_way"].includes(j.status) && (
                  <button disabled={busyJob === j.id + "unassign-technician"} onClick={() => act(j.id, "unassign-technician", undefined, "Technician unassigned")}
                    className="rounded-xl border px-3.5 py-2 text-sm hover:bg-muted disabled:opacity-50">
                    Unassign technician
                  </button>
                )}
                {tab === "completed" && j.technician_name && (
                  <span className="text-xs text-muted-foreground self-center">Delivered by {j.technician_name}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quote dialog */}
      {quoteFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div ref={quoteDialogRef} tabIndex={-1} className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl focus:outline-none">
            <h3 className="font-semibold">Send quote</h3>
            <p className="mt-1 text-xs text-muted-foreground capitalize">{quoteFor.service_category?.replace("_", " ")} · {quoteFor.customer_name}</p>
            <label className="block mt-4 text-sm font-medium" htmlFor="quote-amount">Amount (KES)</label>
            <input id="quote-amount" type="number" min={1} value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)}
              className="mt-1.5 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <p className="mt-2 text-[11px] text-muted-foreground">
              The customer must approve this quote before work starts.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setQuoteFor(null)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
              <button onClick={sendQuote} disabled={!quoteAmount || Number(quoteAmount) <= 0}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Send quote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectTechnician({ team, onAssign, busy }: {
  team: TeamMember[]; busy: boolean; onAssign: (memberId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (team.length === 0) {
    return <span className="text-xs text-muted-foreground self-center">No active technicians — add them in Team.</span>;
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
        Assign technician
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-2xl border bg-card shadow-xl p-1.5 max-h-72 overflow-y-auto">
          {team.map((m) => (
            <button key={m.id} onClick={() => { setOpen(false); onAssign(m.id, m.fullName); }}
              className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-muted text-left">
              <div className="min-w-0">
                <p className="font-medium truncate">{m.fullName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {m.activeJobs} active · {m.isAvailable ? "available" : "off duty"}
                  {m.skills?.length ? ` · ${m.skills.join(", ")}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
