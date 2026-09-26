import { useState, useEffect } from "react";
import { Banknote, Loader2, RefreshCw, BadgeCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface Payout {
  id: string;
  fundi_name?: string;
  fundi_email?: string;
  amount: string | number;
  status: string;
  method?: string;
  destination?: string;
  reference?: string;
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

  const kes = (n: string | number) => `KES ${Number(n).toLocaleString()}`;

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Payouts</h1>
            <p className="text-sm text-muted-foreground">Provider payout ledger — fundi withdrawals and company settlements.</p>
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
                <p className="text-2xl font-bold mt-1">{kes(s.total)}</p>
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
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Reference</th>
                    <th className="p-3 font-medium">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="p-3">
                        <p className="font-medium">{p.fundi_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.fundi_email || ""}</p>
                      </td>
                      <td className="p-3 font-semibold">{kes(p.amount)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[p.status] || "bg-muted"}`}>{p.status}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{p.reference || p.destination || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
