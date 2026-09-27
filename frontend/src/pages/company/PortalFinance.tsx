/**
 * Finance (spec §8 FINANCE + §16) — company earnings, settlements and the
 * real payout loop: request a withdrawal of pending settlements, then
 * platform staff complete the transfer (status: requested → completed).
 * Shows what the company earns (net of platform commission, which is NEVER
 * the customer's concern and is only shown here to authorized finance roles).
 */
import { useEffect, useState } from "react";
import { Banknote, Loader2, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface Summary { gross: number; commission: number; net: number; pending: number; paid: number; availableForWithdrawal?: number }
interface MonthlyRow { month: string; gross: string; commission: string; net: string }
interface Settlement {
  id: string; job_id?: string; gross_amount: string; commission_amount: string;
  net_amount: string; status: string; paid_at?: string; created_at: string;
  service_category?: string; location_name?: string;
}
interface PayoutRequest {
  id: string; amount: string; mpesa_number?: string; status: string;
  provider_reference?: string; created_at: string;
}
interface PayoutAccount { method: string; mpesaNumber?: string; bankName?: string; bankAccount?: string; accountName?: string }

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  processing: "bg-blue-500/10 text-blue-600",
  requested: "bg-amber-500/10 text-amber-600",
  paid: "bg-primary/10 text-primary",
  completed: "bg-primary/10 text-primary",
  failed: "bg-red-500/10 text-red-500",
  cancelled: "bg-muted text-muted-foreground",
};

export default function PortalFinance() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [mpesaNumber, setMpesaNumber] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.request("/company/portal/finance") as {
        summary?: Summary; settlements?: Settlement[]; monthly?: MonthlyRow[];
        payoutRequests?: PayoutRequest[]; payoutAccount?: PayoutAccount;
      };
      setSummary(res.summary || null);
      setSettlements(res.settlements || []);
      setMonthly(res.monthly || []);
      setPayoutRequests(res.payoutRequests || []);
      setPayoutAccount(res.payoutAccount || null);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg.includes("owners/finance") || msg.includes("403") || msg.includes("permission")
        ? "Only company owners and finance users can view settlements."
        : "Unable to load settlements. Try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const requestPayout = async () => {
    setBusy(true); setNotice(null);
    try {
      await apiClient.request("/company/portal/finance/withdraw", {
        method: "POST",
        body: { amount: Number(amount), mpesaNumber: mpesaNumber || undefined },
      });
      setNotice("Payout requested. Platform staff will complete the transfer — you'll get a notification with the reference.");
      setAmount(""); setMpesaNumber("");
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Could not request payout");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="max-w-5xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;

  if (error) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <div className="mt-4 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  const available = summary?.availableForWithdrawal ?? 0;
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
              {formatMoney(value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {notice && <div className="mt-4 rounded-xl border bg-primary/5 text-sm px-3 py-2 text-primary break-words">{notice}</div>}

      {/* ── Withdraw pending settlements ── */}
      <div className="mt-6 rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Withdraw settlements</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Available now: <span className="font-semibold text-foreground tabular-nums">{formatMoney(available)}</span>
              {" "}— oldest settlements are paid out first.
            </p>
            {payoutAccount && (
              <p className="mt-1 text-xs text-muted-foreground">
                Payout account: {payoutAccount.method === "bank"
                  ? `${payoutAccount.bankName || "bank"} ${payoutAccount.bankAccount ?? ""}`
                  : `M-Pesa ${payoutAccount.mpesaNumber ?? "not set"}`}
              </p>
            )}
          </div>
        </div>
        {available > 0 ? (
          <div className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="withdraw-amount" className="text-sm font-medium">Amount (KES)</label>
              <input id="withdraw-amount" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={String(Math.floor(available))}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label htmlFor="withdraw-mpesa" className="text-sm font-medium">M-Pesa number <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input id="withdraw-mpesa" inputMode="tel" value={mpesaNumber}
                onChange={(e) => setMpesaNumber(e.target.value)}
                placeholder="07XX or 2547XX — defaults to saved account"
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <button onClick={requestPayout} disabled={busy || !amount || Number(amount) <= 0 || Number(amount) > available}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium disabled:opacity-50 h-[42px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Request payout
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nothing available to withdraw yet — pending settlements appear here as customers confirm completed jobs.</p>
        )}
      </div>

      {/* ── Payout requests history ── */}
      {payoutRequests.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Payout requests</h2>
          <div className="mt-3 rounded-2xl border bg-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
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
                {payoutRequests.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.mpesa_number || "saved account"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[p.status] || "bg-muted"}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.provider_reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(m.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">−{formatMoney(m.commission)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Settlement history</h2>
      {settlements.length === 0 ? (
        <div className="mt-3 rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
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
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(s.gross_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">−{formatMoney(s.commission_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(s.net_amount)}</td>
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
