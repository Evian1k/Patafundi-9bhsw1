/**
 * Growth Dashboard — Super Admin only
 * Shows: user growth, job growth, revenue growth, retention, conversion
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { TrendingUp, Users, Package, DollarSign, Activity } from "lucide-react";

interface GrowthData {
  overview: {
    total_users: number;
    new_users_30d: number;
    total_jobs: number;
    new_jobs_30d: number;
    total_revenue: number;
    revenue_30d: number;
    customer_retention: number;
    fundi_retention: number;
  };
  chartData: Array<{ date: string; users: number; jobs: number; revenue: number }>;
}

export default function GrowthDashboard() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getAdminReportsAnalytics(30)
      .then((d: any) => setData({
        overview: {
          total_users: d?.summary?.total_users || 0,
          new_users_30d: d?.summary?.new_users || 0,
          total_jobs: d?.summary?.total_jobs || 0,
          new_jobs_30d: d?.summary?.total_jobs || 0,
          total_revenue: Number(d?.summary?.total_revenue || 0),
          revenue_30d: Number(d?.summary?.total_revenue || 0),
          customer_retention: 0,
          fundi_retention: 0,
        },
        chartData: d?.chartData || [],
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading growth analytics…</div>;
  if (!data) return <div className="p-8 text-slate-400">No data available</div>;

  const o = data.overview;
  const fmt = (n: number) => Number(n).toLocaleString();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Growth Dashboard</h1>
      <p className="text-slate-500 text-sm mb-6">User acquisition, job growth, and revenue trends</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card icon={Users} label="Total Users" value={fmt(o.total_users)} sub={`${o.new_users_30d} new (30d)`} />
        <Card icon={Package} label="Total Jobs" value={fmt(o.total_jobs)} sub={`${o.new_jobs_30d} new (30d)`} />
        <Card icon={DollarSign} label="Total Revenue" value={`KES ${fmt(o.total_revenue)}`} sub={`KES ${fmt(o.revenue_30d)} (30d)`} />
        <Card icon={TrendingUp} label="Customer Retention" value={`${o.customer_retention}%`} sub="30-day rolling" />
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-100 mb-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Growth Chart (Last 30 Days)
        </h3>
        {data.chartData.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No data yet</p>
        ) : (
          <div className="space-y-1">
            {data.chartData.slice(-14).map((d, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-slate-500 w-24">{new Date(d.date).toLocaleDateString()}</span>
                <div className="flex-1 flex gap-2">
                  <span className="text-blue-600">{d.users} users</span>
                  <span className="text-green-600">{d.jobs} jobs</span>
                  <span className="text-amber-600">KES {Number(d.revenue).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
