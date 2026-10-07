/**
 * Admin: Company Applications review queue + Companies management (spec §14/§15).
 * Sensitive actions (approve/suspend/reactivate) hit server-side admin endpoints
 * that write audit logs — the browser never performs money/verification alone.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import AdminLayout from "@/components/admin/AdminLayout";

interface Application {
  id: string; companyName: string; contactName: string; contactEmail: string;
  contactPhone: string; businessCategories: string[]; serviceAreas: string[];
  technicianCount?: number; description?: string; status: string;
  applicant_name?: string; createdAt: string; reviewNotes?: string;
}
interface Company {
  id: string; companyName: string; status: string; ownerName?: string;
  memberCount: number; jobCount: number; rating?: number; completedJobs?: number;
  pendingSettlements?: number; pendingSettlementsKes?: number;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-500/10 text-amber-600",
  reviewing: "bg-blue-500/10 text-blue-600",
  more_info_required: "bg-orange-500/10 text-orange-600",
  approved: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-red-500/10 text-red-500",
  suspended: "bg-red-500/10 text-red-500",
  archived: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

export default function CompanyApplications() {
  const [tab, setTab] = useState<"applications" | "companies">("applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [apps, comps] = await Promise.all([
        apiClient.request("/admin/company-applications") as Promise<{ applications?: Application[] }>,
        apiClient.request("/admin/companies") as Promise<{ companies?: Company[] }>,
      ]);
      setApplications(apps.applications || []);
      setCompanies(comps.companies || []);
    } catch {
      setError("Unable to load company data. Check your permissions.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: string) => {
    setBusy(id + status); setNotice(null);
    try {
      // Backend route: POST /company/applications/:id/review (admin-gated)
      await apiClient.request(`/company/applications/${id}/review`, {
        method: "POST", body: { status },
      });
      setNotice(`Application ${status}.`);
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const companyAction = async (id: string, action: string) => {
    setBusy(id + action); setNotice(null);
    try {
      await apiClient.request(`/admin/companies/${id}/action`, { method: "POST", body: { action } });
      setNotice(`Company ${action}d.`);
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Partner applications and the verified company network.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab("applications")}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${tab === "applications" ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-muted"}`}>
            Applications ({applications.length})
          </button>
          <button onClick={() => setTab("companies")}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${tab === "companies" ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-muted"}`}>
            Companies ({companies.length})
          </button>
        </div>
      </div>

      {notice && <div className="rounded-xl border bg-emerald-500/5 text-sm px-3 py-2 text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : tab === "applications" ? (
        applications.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No applications yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((a) => (
              <div key={a.id} className="rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold">{a.companyName}</h2>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[a.status] || "bg-muted"}`}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.contactName} · {a.contactEmail} · {a.contactPhone}
                      {a.applicant_name ? ` · applicant: ${a.applicant_name}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {(a.businessCategories || []).map((c) => (
                        <span key={c} className="rounded-full border px-2 py-0.5 capitalize">{c.replace(/_/g, " ")}</span>
                      ))}
                      {(a.serviceAreas || []).slice(0, 4).map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5">{s}</span>
                      ))}
                    </div>
                    {a.description && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{a.description}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.status !== "approved" && (
                    <button disabled={busy === a.id + "approved"} onClick={() => review(a.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-3.5 py-2 text-sm font-medium disabled:opacity-50">
                      {busy === a.id + "approved" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Approve
                    </button>
                  )}
                  {a.status === "submitted" && (
                    <button disabled={busy === a.id + "reviewing"} onClick={() => review(a.id, "reviewing")}
                      className="rounded-xl border px-3.5 py-2 text-sm hover:bg-muted disabled:opacity-50">Mark under review</button>
                  )}
                  {a.status !== "rejected" && a.status !== "approved" && (
                    <button disabled={busy === a.id + "rejected"} onClick={() => review(a.id, "rejected")}
                      className="rounded-xl border px-3.5 py-2 text-sm text-red-600 hover:bg-red-500/5 disabled:opacity-50">Reject</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : companies.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">No approved companies yet.</div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium text-right">Members</th>
                <th className="px-4 py-3 font-medium text-right">Jobs</th>
                <th className="px-4 py-3 font-medium text-right">Rating</th>
                <th className="px-4 py-3 font-medium text-right">Pending</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/admin/companies/${c.id}`} className="hover:text-primary hover:underline">
                      {c.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.ownerName || "Not provided"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.memberCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.jobCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.rating?.toFixed(1) || "Not provided"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatMoney(c.pendingSettlementsKes ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${c.status === "approved" ? "bg-emerald-500/10 text-emerald-600" : c.status === "suspended" ? "bg-red-500/10 text-red-500" : "bg-muted"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "approved" ? (
                      <button disabled={busy === c.id + "suspend"} onClick={() => companyAction(c.id, "suspend")}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/5 disabled:opacity-50">
                        <ShieldAlert className="h-3 w-3" /> Suspend
                      </button>
                    ) : c.status === "suspended" ? (
                      <button disabled={busy === c.id + "reactivate"} onClick={() => companyAction(c.id, "reactivate")}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-emerald-600 hover:bg-emerald-500/5 disabled:opacity-50">
                        <ShieldCheck className="h-3 w-3" /> Reactivate
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </AdminLayout>
  );
}
