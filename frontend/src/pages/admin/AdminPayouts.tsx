import { useState, useEffect } from "react";
import { Banknote, BadgeCheck, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { formatMoney } from "@/lib/money";

interface Payout {
  id: string;
  provider_type?: "fundi" | "company";
  provider_name?: string;
  provider_email?: string;
  fundi_name?: string;
  fundi_email?: string;
  company_name?: string;
  amount: string | number;
  status: string;
  method?: string;
  destination?: string;
  reference?: string;
  provider_reference?: string;
  mpesa_number?: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-500/10 text-amber-600",
  processing: "bg-blue-500/10 text-blue-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-red-500/10 text-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<{ status: string; count: number; total: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [referenceDraft, setReferenceDraft] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.adminListPayouts(statusFilter) as { payouts?: Payout[]; stats?: typeof stats };
      setPayouts(res.payouts || []);
      setStats(res.stats || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openComplete = (p: Payout) => {
    setCompletingId(p.id);
    setReferenceDraft(p.provider_reference || "");
  };

  const confirmComplete = async () => {
    if (!completingId) return;
    try {
      await apiClient.request(`/admin/payouts/${completingId}/complete`, {
        method: "POST",
        body: { providerReference: referenceDraft || undefined },
      });
      toast.success("Payout marked completed - provider notified.");
      setCompletingId(null);
      setReferenceDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete payout");
    }
  };

  const providerOf = (p: Payout) => ({
    type: p.provider_type || (p.company_name ? "company" : "fundi"),
    name: p.provider_name || (p.company_name ? p.company_name : p.fundi_name) || "Unknown payee",
    email: p.provider_email || (p.company_name ? "" : p.fundi_email) || "",
  });

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Payouts</h1>
            <p className="text-sm text-muted-foreground">Provider payout ledger - fundi withdrawals and company settlement payouts.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.length === 0 && !loading ? (
            <Card className="p-4 text-sm text-muted-foreground">No payout records yet.</Card>
          ) : (
            stats.map((s) => (
              <Card key={s.status} className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.status}</p>
                <p className="text-2xl font-bold mt-1">{formatMoney(s.total)}</p>
                <p className="text-xs text-muted-foreground">{s.count} payout{s.count === 1 ? "" : "s"}</p>
              </Card>
            ))
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", "requested", "processing", "completed", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {s}
            </button>
          ))}
        </div>

        {completingId && (
          <Card className="p-4 border-primary/40">
            <p className="text-sm font-medium">Complete payout</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Company settlement payouts also mark the oldest pending settlements as paid (FIFO) when completed.
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <input
                aria-label="Provider reference"
                value={referenceDraft}
                onChange={(e) => setReferenceDraft(e.target.value)}
                placeholder="M-Pesa / bank transaction reference"
                className="flex-1 min-w-[240px] rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <Button size="sm" onClick={confirmComplete}><BadgeCheck className="w-4 h-4 mr-1.5" />Confirm completion</Button>
              <Button size="sm" variant="outline" onClick={() => { setCompletingId(null); setReferenceDraft(""); }}>Cancel</Button>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading payouts…
            </div>
          ) : payouts.length === 0 ? (
            <div className="p-10 text-center">
              <Banknote className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium">No payouts in this state</p>
              <p className="text-sm text-muted-foreground">Payouts appear here once providers request withdrawals.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-medium">Provider</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Destination</th>
                    <th className="p-3 font-medium">Requested</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => {
                    const provider = providerOf(p);
                    const actionable = p.status === "requested" || p.status === "processing";
                    return (
                      <tr key={p.id} className="border-t border-border/60">
                        <td className="p-3">
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">{provider.email}</p>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${provider.type === "company" ? "bg-indigo-500/10 text-indigo-600" : "bg-muted text-muted-foreground"}`}>
                            {provider.type}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">{formatMoney(p.amount)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[p.status] || "bg-muted"}`}>{p.status}</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{p.reference || p.destination || p.mpesa_number || "Not recorded"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          {actionable ? (
                            <Button size="sm" variant="outline" onClick={() => openComplete(p)}>
                              <BadgeCheck className="w-3.5 h-3.5 mr-1.5" />Complete
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{p.provider_reference || "Not recorded"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
