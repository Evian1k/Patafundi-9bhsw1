import { useState, useEffect } from "react";
import { Repeat, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface Subscription {
  id: string;
  subscriber_name?: string;
  subscriber_email?: string;
  subscriber_role?: string;
  subscriber_type: string;
  plan: string;
  amount: string | number;
  status: string;
  starts_at: string;
  expires_at: string;
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<{ subscriber_type: string; status: string; count: number; total: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.adminListSubscriptions() as { subscriptions?: Subscription[]; stats?: typeof stats };
      setSubs(res.subscriptions || []);
      setStats(res.stats || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">Platform subscription revenue — kept strictly separate from job commissions in finance reports.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.length === 0 && !loading ? (
            <Card className="p-4 text-sm text-muted-foreground">No subscription records yet.</Card>
          ) : (
            stats.map((s, i) => (
              <Card key={i} className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.subscriber_type} · {s.status}</p>
                <p className="text-2xl font-bold mt-1">KES {Number(s.total).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{s.count} active record{s.count === 1 ? "" : "s"}</p>
              </Card>
            ))
          )}
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading subscriptions…
            </div>
          ) : subs.length === 0 ? (
            <div className="p-10 text-center">
              <Repeat className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium">No subscriptions yet</p>
              <p className="text-sm text-muted-foreground">Fundi and company plan subscriptions will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-medium">Subscriber</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Plan</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-t border-border/60">
                      <td className="p-3">
                        <p className="font-medium">{s.subscriber_name || "Unknown subscriber"}</p>
                        <p className="text-xs text-muted-foreground">{s.subscriber_email || ""}</p>
                      </td>
                      <td className="p-3 capitalize">{s.subscriber_type}</td>
                      <td className="p-3 capitalize">{s.plan}</td>
                      <td className="p-3 font-semibold">KES {Number(s.amount).toLocaleString()}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                          s.status === "active" ? "bg-emerald-500/10 text-emerald-600" : s.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"
                        }`}>{s.status}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(s.expires_at).toLocaleDateString()}</td>
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
