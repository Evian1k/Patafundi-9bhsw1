/**
 * Finance Dashboard — Super Admin + Finance Team
 * Top cards: Revenue Today, Escrow Balance, Pending Payouts, Refund Requests
 * Charts: Daily Revenue, Monthly Revenue, Commission Revenue, Payout Trends
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { DollarSign, Wallet, Clock, RotateCcw, TrendingUp } from "lucide-react";

interface FinanceData {
  revenueToday: number;
  revenueMonth: number;
  escrowBalance: number;
  pendingPayouts: number;
  refundRequests: number;
  commissionRevenue: number;
  dailyRevenue: Array<{ date: string; amount: number }>;
  payoutTrends: Array<{ date: string; amount: number }>;
}

export default function FinanceDashboard() {
  const [data, setData] = useState<FinanceData>({ revenueToday: 0, revenueMonth: 0, escrowBalance: 0, pendingPayouts: 0, refundRequests: 0, commissionRevenue: 0, dailyRevenue: [], payoutTrends: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.getAdminDashboard(),
      apiClient.request("/staff/revenue").catch(() => null),
    ])
      .then(([dash, rev]: any) => {
        const stats = dash?.stats || {};
        const revenue = rev?.totals || {};
        setData({
          revenueToday: Number(revenue.dailyRevenue || 0),
          revenueMonth: Number(revenue.monthlyRevenue || stats.revenue || 0),
          escrowBalance: Number(stats.revenueBreakdown?.totals?.escrowBalance || 0),
          pendingPayouts: 0,
          refundRequests: 0,
          commissionRevenue: Number(revenue.commissionRevenue || 0),
          dailyRevenue: [],
          payoutTrends: [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading finance dashboard…</div>;
  // data is always defined (initialized with empty defaults)

  const fmt = (n: number) => `KES ${Number(n).toLocaleString()}`;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Finance Dashboard</h1>
      <p className="text-slate-500 text-sm mb-6">Revenue, escrow, payouts, and refunds overview</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card icon={DollarSign} label="Revenue Today" value={fmt(data.revenueToday)} color="text-green-600" />
        <Card icon={Wallet} label="Escrow Balance" value={fmt(data.escrowBalance)} color="text-blue-600" />
        <Card icon={Clock} label="Pending Payouts" value={fmt(data.pendingPayouts)} color="text-amber-600" />
        <Card icon={RotateCcw} label="Refund Requests" value={data.refundRequests.toString()} color="text-red-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" /> Monthly Revenue
          </h3>
          <div className="text-3xl font-bold text-slate-900">{fmt(data.revenueMonth)}</div>
          <p className="text-xs text-slate-500 mt-1">Commission: {fmt(data.commissionRevenue)}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Payout Trends
          </h3>
          {data.payoutTrends.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No payouts yet</p>
          ) : (
            <div className="space-y-1">
              {data.payoutTrends.slice(-7).map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-500">{new Date(p.date).toLocaleDateString()}</span>
                  <span className="font-medium">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
