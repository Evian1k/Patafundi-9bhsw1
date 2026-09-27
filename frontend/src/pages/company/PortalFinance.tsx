/**
 * Finance (spec §8 FINANCE + §16) — company earnings & settlements.
 * Shows what the company earns (net of platform commission, which is NEVER
 * the customer's concern and is only shown here to authorized finance roles).
 */
import { useEffect, useState } from "react";
import { Banknote, TrendingUp, Wallet } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Summary { gross: number; commission: number; net: number; pending: number; paid: number }
interface MonthlyRow { month: string; gross: string; commission: string; net: string }
interface Settlement {
  id: string; job_id?: string; gross_amount: string; commission_amount: string;
  net_amount: string; status: string; paid_at?: string; created_at: string;
  service_category?: string; location_name?: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  processing: "bg-blue-500/10 text-blue-600",
  paid: "bg-primary/10 text-primary",
  failed: "bg-red-500/10 text-red-500",
  cancelled: "bg-muted text-muted-foreground",
};

export default function PortalFinance() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/finance") as { summary?: Summary; settlements?: Settlement[]; monthly?: MonthlyRow[] };
        setSummary(res.summary || null);
        setSettlements(res.settlements || []);
        setMonthly(res.monthly || []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        setError(msg.includes("owners/finance") || msg.includes("403")
          ? "Only company owners and finance users can view settlements."
          : "Unable to load settlements. Try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="max-w-5xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;

  if (error) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <div className="mt-4 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  const cards = [
    { label: "Gross earnings", value: summary?.gross, icon: Banknote, tone: "text-sky-600 bg-sky-500/10" },
    { label: "Platform commission", value: summary?.commission, icon: TrendingUp, tone: "text-amber-600 bg-amber-500/10" },
    { label: "Net to company", value: summary?.net, icon: Wallet, tone: "text-primary bg-primary/10" },
    { label: "Pending payout", value: summary?.pending, icon: Wallet, tone: "text-orange-600 bg-orange-500/10" },
    { label: "Paid out", value: summary?.paid, icon: Banknote, tone: "text-primary bg-primary/10" },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Settlements are calculated server-side after each confirmed job.</p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
              KES {Number(value || 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Monthly breakdown</h2>
      {monthly.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No monthly history yet — it builds up as jobs settle.</p>
      ) : (
        <div className="mt-3 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium text-right">Gross</th>
                <th className="px-4 py-3 font-medium text-right">Commission</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthly.map((m) => (
                <tr key={m.month} className="hover:bg-muted/40">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(m.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(m.gross).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">−{Number(m.commission).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{Number(m.net).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Settlement history</h2>
      {settlements.length === 0 ? (
        <div className="mt-3 rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No settlements yet. After a customer confirms a completed job, the settlement appears here.
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium text-right">Gross</th>
                <th className="px-4 py-3 font-medium text-right">Commission</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settlements.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <p className="capitalize">{(s.service_category || "service").replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{s.location_name}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(s.gross_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">−{Number(s.commission_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{Number(s.net_amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[s.status] || "bg-muted"}`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
