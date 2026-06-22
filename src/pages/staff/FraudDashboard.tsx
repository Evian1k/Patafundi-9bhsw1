/**
 * Fraud Dashboard — Super Admin + Fraud Analyst
 * Top cards: Suspicious Accounts, Suspicious Payments, Referral Abuse, Multiple Accounts
 * Charts: Fraud Trends, Suspended Users, Fraud By Region
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { AlertTriangle, CreditCard, Gift, Users, TrendingUp } from "lucide-react";

export default function FraudDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.getFraudDashboard(),
      apiClient.getReferralAnalytics().catch(() => null),
    ])
      .then(([fraud, referral]: any) => {
        const f = fraud?.dashboard || fraud || {};
        const r = referral?.overview || {};
        setData({
          suspiciousAccounts: f.fraudAlerts?.open || f.alerts?.open || 0,
          suspiciousPayments: f.suspiciousPayments || 0,
          referralAbuse: r.fraud_attempts || 0,
          multipleAccounts: f.multipleAccounts || 0,
          fraudTrends: f.trends || [],
          suspendedUsers: f.suspended || 0,
          fraudByRegion: f.byRegion || [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading fraud dashboard…</div>;
  if (!data) return <div className="p-8 text-slate-400">No data available</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Fraud Dashboard</h1>
      <p className="text-slate-500 text-sm mb-6">Trust & Safety — suspicious activity monitoring</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card icon={AlertTriangle} label="Suspicious Accounts" value={data.suspiciousAccounts} color="text-red-600" bg="bg-red-50" />
        <Card icon={CreditCard} label="Suspicious Payments" value={data.suspiciousPayments} color="text-amber-600" bg="bg-amber-50" />
        <Card icon={Gift} label="Referral Abuse" value={data.referralAbuse} color="text-purple-600" bg="bg-purple-50" />
        <Card icon={Users} label="Multiple Accounts" value={data.multipleAccounts} color="text-pink-600" bg="bg-pink-50" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-500" /> Fraud Trends
          </h3>
          {data.fraudTrends.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No fraud detected 🎉</p>
          ) : (
            <div className="space-y-1">
              {data.fraudTrends.slice(-7).map((t: any, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-500">{new Date(t.date).toLocaleDateString()}</span>
                  <span className="font-medium text-red-600">{t.count} alerts</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Suspended Users</h3>
          <div className="text-3xl font-bold text-red-600">{data.suspendedUsers}</div>
          <p className="text-xs text-slate-500 mt-1">Total accounts suspended for fraud</p>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
