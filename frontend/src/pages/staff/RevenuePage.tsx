import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api";

type Totals = {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  lifetimeRevenue: number;
  commissionRevenue: number;
  withdrawalFeeRevenue: number;
  subscriptionRevenue: number;
  refundCosts: number;
  netProfit: number;
};

const fmt = (n: number) => `KES ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Real revenue dashboard (spec §63) — reads /staff/revenue (revenue_ledger).
 * Every figure is server-computed; empty ledger renders honest zeros. */
export default function RevenuePage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiClient.request("/staff/revenue")) as { totals?: Totals };
      setTotals(res?.totals ?? null);
    } catch {
      setError("Could not load revenue data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cards: { label: string; value: number | undefined; hint?: string }[] = [
    { label: "Today", value: totals?.dailyRevenue },
    { label: "This Week", value: totals?.weeklyRevenue },
    { label: "This Month", value: totals?.monthlyRevenue },
    { label: "This Year", value: totals?.yearlyRevenue },
    { label: "Lifetime Revenue", value: totals?.lifetimeRevenue },
    { label: "Commission Revenue", value: totals?.commissionRevenue, hint: "Platform commission entries" },
    { label: "Subscription Revenue", value: totals?.subscriptionRevenue, hint: "Plan payments" },
    { label: "Withdrawal Fees", value: totals?.withdrawalFeeRevenue },
    { label: "Refund Costs", value: totals?.refundCosts, hint: "Approved refunds" },
    { label: "Net (lifetime − refunds)", value: totals?.netProfit },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display font-bold text-2xl">Revenue</h1>
            <p className="text-sm text-muted-foreground">All figures come from the revenue ledger — nothing is estimated.</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 hover:bg-muted rounded-xl transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <button onClick={load} className="text-sm underline">Try again</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cards.map((c) => (
              <div key={c.label} className="bg-card rounded-2xl border border-border/60 p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="font-display font-bold text-xl mt-1">{fmt(c.value ?? 0)}</p>
                {c.hint && <p className="text-[11px] text-muted-foreground mt-1">{c.hint}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
