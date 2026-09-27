/**
 * Admin: single-company detail (spec §14 detailed company management).
 * Everything the platform knows about one company: profile + legal,
 * members & their capabilities, service catalog, job history, settlement
 * ledger, payout requests and the originating partner application.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface CompanyDetail {
  company: {
    id: string; companyName: string; legalName?: string; description?: string; logoUrl?: string;
    status: string; businessCategories: string[]; serviceAreas: string[]; branches: Array<Record<string, unknown>>;
    technicianCount?: number; teamSize?: number; rating?: number; completedJobs?: number;
    availability?: string; website?: string; guarantees?: string[];
    contactName?: string; contactEmail?: string; contactPhone?: string; registrationNumber?: string;
    licenseDetails?: string; payoutAccount?: { method: string; mpesaNumber?: string; bankName?: string; bankAccount?: string };
  };
  owner?: { fullName?: string; email?: string; phone?: string } | null;
  members: Array<{ id: string; fullName: string; email: string; role: string; status: string; skills?: string[]; permissions?: string[] | null; isAvailable?: boolean }>;
  services: Array<{ id: string; name: string; category: string; base_price?: string; is_active: boolean }>;
  jobs: Array<{ id: string; status: string; service_category?: string; final_price?: string; estimated_price?: string; escrow_status?: string; payment_status?: string; technician_name?: string; customer_name?: string; created_at: string }>;
  finance: { gross: number; commission: number; net: number; pending: number; paid: number; pendingCount: number; availableForWithdrawal: number };
  settlements: Array<{ id: string; job_id?: string; gross_amount: string; commission_amount: string; net_amount: string; status: string; paid_at?: string; payout_reference?: string; service_category?: string; created_at: string }>;
  payoutRequests: Array<{ id: string; amount: string; status: string; provider_reference?: string; mpesa_number?: string; created_at: string }>;
  application?: { id: string; company_name: string; status: string; company_registration_number?: string; license_details?: string; review_notes?: string; created_at: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  submitted: "bg-amber-500/10 text-amber-600",
  suspended: "bg-red-500/10 text-red-500",
  rejected: "bg-red-500/10 text-red-500",
  paid: "bg-primary/10 text-primary",
  completed: "bg-primary/10 text-primary",
  processing: "bg-blue-500/10 text-blue-600",
  requested: "bg-amber-500/10 text-amber-600",
  cancelled: "bg-muted text-muted-foreground",
};

const badge = (status: string) =>
  `inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`;

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.request(`/admin/companies/${id}`) as unknown as CompanyDetail;
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load company");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const action = async (act: "suspend" | "reactivate") => {
    if (!id) return;
    setBusy(true);
    try {
      await apiClient.request(`/admin/companies/${id}/action`, { method: "POST", body: { action: act } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to companies
        </Link>
        <div className="rounded-2xl border bg-red-500/5 p-8 text-center text-sm text-red-600">{error || "Company not found"}</div>
      </div>
    );
  }

  const c = data.company;
  return (
    <div className="space-y-5">
      <Link to="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to companies
      </Link>

      {/* ── Header ── */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold tracking-tight">{c.companyName}</h1>
              <span className={badge(c.status)}>{c.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.legalName ? `${c.legalName} · ` : ""}Reg: {c.registrationNumber || data.application?.company_registration_number || "—"}
              {c.rating ? ` · ★ ${Number(c.rating).toFixed(1)}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Owner: {data.owner?.fullName || "—"} ({data.owner?.email || "—"}) · Contact: {c.contactName || "—"} {c.contactPhone || ""}
            </p>
            {c.description && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{c.description}</p>}
          </div>
          <div className="flex gap-2">
            {c.status === "approved" ? (
              <button disabled={busy} onClick={() => action("suspend")}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm text-red-600 hover:bg-red-500/5 disabled:opacity-50">
                <ShieldAlert className="h-4 w-4" /> Suspend
              </button>
            ) : c.status === "suspended" ? (
              <button disabled={busy} onClick={() => action("reactivate")}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm text-emerald-600 hover:bg-emerald-500/5 disabled:opacity-50">
                <ShieldCheck className="h-4 w-4" /> Reactivate
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
          {(c.businessCategories || []).map((cat) => <span key={cat} className="rounded-full border px-2 py-0.5 capitalize">{cat.replace("_", " ")}</span>)}
          {(c.serviceAreas || []).map((a) => <span key={a} className="rounded-full bg-muted px-2 py-0.5">{a}</span>)}
        </div>
      </div>

      {/* ── Finance summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Gross", value: data.finance.gross },
          { label: "Commission", value: data.finance.commission },
          { label: "Net earned", value: data.finance.net },
          { label: "Pending", value: data.finance.pending },
          { label: "Paid out", value: data.finance.paid },
          { label: "Withdrawable", value: data.finance.availableForWithdrawal },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1.5 text-lg font-semibold tabular-nums">{formatMoney(card.value)}</p>
          </div>
        ))}
      </div>

      {/* ── Members ── */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Members ({data.members.length})</h2>
        <div className="mt-2 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Skills</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.fullName}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{m.role}</td>
                  <td className="px-4 py-3"><span className={badge(m.status)}>{m.status}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{m.skills?.join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Services ── */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Service catalog ({data.services.length})</h2>
        {data.services.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No services listed.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.services.map((s) => (
              <span key={s.id} className="rounded-xl border bg-card px-3 py-2 text-sm">
                {s.name} <span className="text-xs text-muted-foreground">· {s.category}{s.base_price ? ` · from ${formatMoney(s.base_price)}` : ""}</span>
                {!s.is_active && <span className="ml-1.5 text-[10px] text-muted-foreground">(inactive)</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Payout requests ── */}
      {data.payoutRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Payout requests</h2>
          <div className="mt-2 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.payoutRequests.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.mpesa_number || "saved account"}</td>
                    <td className="px-4 py-3"><span className={badge(p.status)}>{p.status}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.provider_reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Settlement ledger ── */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Settlement ledger</h2>
        {data.settlements.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No settlements recorded yet.</p>
        ) : (
          <div className="mt-2 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium text-right">Gross</th>
                  <th className="px-4 py-3 font-medium text-right">Commission</th>
                  <th className="px-4 py-3 font-medium text-right">Net</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 capitalize text-xs">{(s.service_category || "—").replace("_", " ")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(s.gross_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">−{formatMoney(s.commission_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(s.net_amount)}</td>
                    <td className="px-4 py-3"><span className={badge(s.status)}>{s.status}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.paid_at ? new Date(s.paid_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent jobs ── */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Recent jobs ({data.jobs.length})</h2>
        {data.jobs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No jobs booked through this company yet.</p>
        ) : (
          <div className="mt-2 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(j.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 capitalize text-xs">{(j.service_category || "—").replace("_", " ")}</td>
                    <td className="px-4 py-3 text-xs">{j.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-xs">{j.technician_name || "Unassigned"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(j.final_price || j.estimated_price || 0)}</td>
                    <td className="px-4 py-3"><span className="capitalize text-xs">{j.status.replace("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Application ── */}
      {data.application && (
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-tight">Partner application</h2>
          <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(data.application.created_at).toLocaleDateString()} · status: {data.application.status}</p>
          {data.application.license_details && (
            <p className="mt-2 text-sm"><span className="font-medium">License:</span> {data.application.license_details}</p>
          )}
          {data.application.review_notes && (
            <p className="mt-1 text-sm"><span className="font-medium">Review notes:</span> {data.application.review_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
