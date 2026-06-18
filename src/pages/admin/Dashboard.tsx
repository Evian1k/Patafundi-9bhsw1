import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users, Shield, Briefcase, TrendingUp, AlertCircle, Clock, RefreshCw,
  Wallet, AlertOctagon, CheckCircle, XCircle, Scale, Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { demoDashboardStats, DEMO_MODE } from "@/lib/demo";

interface DashboardStats {
  totalUsers: number;
  totalFundis: number;
  pendingVerifications: number;
  approvedFundis: number;
  rejectedFundis: number;
  suspendedFundis: number;
  activeJobs: number;
  completedJobs: number;
  totalRevenue: number;
  escrowPending?: number;
  bypassAlerts?: number;
  openDisputes?: number;
}

interface ChartPoint { name: string; value?: number; jobs?: number; revenue?: number }

const DEFAULT_STATS: DashboardStats = {
  totalUsers: 0, totalFundis: 0, pendingVerifications: 0,
  approvedFundis: 0, rejectedFundis: 0, suspendedFundis: 0,
  activeJobs: 0, completedJobs: 0, totalRevenue: 0,
  escrowPending: 0, bypassAlerts: 0, openDisputes: 0,
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>(DEMO_MODE ? (demoDashboardStats as DashboardStats) : DEFAULT_STATS);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(DEMO_MODE ? new Date() : null);

  const fetchDashboardData = useCallback(async () => {
    if (DEMO_MODE) {
      setStats(demoDashboardStats as DashboardStats);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.request('/admin/dashboard-stats', { includeAuth: true }) as {
        stats?: Partial<DashboardStats>;
        chartData?: ChartPoint[];
      };
      setStats({ ...DEFAULT_STATS, ...response.stats });
      setChartData(response.chartData || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      // Don't clear existing stats on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30_000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(amount || 0);

  const statCards = [
    { icon: Users, title: "Total Users", value: stats.totalUsers.toLocaleString(), color: "text-blue-600 bg-blue-50", action: () => navigate('/admin/customers') },
    { icon: Shield, title: "Approved Fundis", value: stats.approvedFundis.toLocaleString(), color: "text-green-600 bg-green-50", action: () => navigate('/admin/fundis') },
    { icon: AlertCircle, title: "Pending Reviews", value: stats.pendingVerifications.toLocaleString(), color: "text-yellow-600 bg-yellow-50", action: () => navigate('/admin/fundis'), urgent: stats.pendingVerifications > 0 },
    { icon: Activity, title: "Active Jobs", value: stats.activeJobs.toLocaleString(), color: "text-purple-600 bg-purple-50", action: () => navigate('/admin/jobs') },
    { icon: Briefcase, title: "Completed Jobs", value: stats.completedJobs.toLocaleString(), color: "text-cyan-600 bg-cyan-50" },
    { icon: Wallet, title: "Total Revenue", value: formatCurrency(stats.totalRevenue), color: "text-emerald-600 bg-emerald-50", action: () => navigate('/admin/payments') },
    { icon: AlertOctagon, title: "Bypass Alerts", value: (stats.bypassAlerts || 0).toLocaleString(), color: "text-red-600 bg-red-50", action: () => navigate('/admin/security'), urgent: (stats.bypassAlerts || 0) > 0 },
    { icon: Clock, title: "Escrow Queue", value: (stats.escrowPending || 0).toLocaleString(), color: "text-orange-600 bg-orange-50", action: () => navigate('/admin/payments') },
    { icon: Scale, title: "Open Disputes", value: (stats.openDisputes || 0).toLocaleString(), color: (stats.openDisputes || 0) > 0 ? "text-red-600 bg-red-50" : "text-gray-600 bg-gray-50", action: () => navigate('/admin/disputes'), urgent: (stats.openDisputes || 0) > 0 },
    { icon: TrendingUp, title: "Rejected Fundis", value: stats.rejectedFundis.toLocaleString(), color: "text-red-500 bg-red-50" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm">
              {DEMO_MODE ? 'Demo data — connect backend for live stats' : 'Real-time platform overview'}
            </p>
            {lastRefresh && (
              <p className="text-xs text-gray-400 mt-0.5">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <Button onClick={fetchDashboardData} disabled={loading} variant="outline" size="sm" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Priority alerts */}
        {!loading && (stats.pendingVerifications > 0 || (stats.bypassAlerts || 0) > 0 || (stats.openDisputes || 0) > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.pendingVerifications > 0 && (
              <button onClick={() => navigate('/admin/fundis')} className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-left hover:bg-yellow-100 transition-colors">
                <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-800 text-sm">{stats.pendingVerifications} Pending Verifications</p>
                  <p className="text-xs text-yellow-600">Fundis awaiting approval</p>
                </div>
              </button>
            )}
            {(stats.bypassAlerts || 0) > 0 && (
              <button onClick={() => navigate('/admin/security')} className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-left hover:bg-red-100 transition-colors">
                <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <p className="font-semibold text-red-800 text-sm">{stats.bypassAlerts} Bypass Alerts</p>
                  <p className="text-xs text-red-600">Potential off-platform payments</p>
                </div>
              </button>
            )}
            {(stats.openDisputes || 0) > 0 && (
              <button onClick={() => navigate('/admin/disputes')} className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl text-left hover:bg-orange-100 transition-colors">
                <Scale className="w-5 h-5 text-orange-600 shrink-0" />
                <div>
                  <p className="font-semibold text-orange-800 text-sm">{stats.openDisputes} Open Disputes</p>
                  <p className="text-xs text-orange-600">Require admin resolution</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Stat grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map(({ icon: Icon, title, value, color, action, urgent }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card
                className={`p-4 transition-all ${action ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} ${urgent ? 'border-red-200 ring-1 ring-red-200' : ''}`}
                onClick={action}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {urgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                </div>
                <p className="text-xs text-gray-500 mb-0.5">{title}</p>
                <p className="text-xl font-bold text-gray-900">{loading ? '...' : value}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        {chartData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-semibold mb-1 text-gray-900">Jobs Trend</h3>
              <p className="text-xs text-gray-400 mb-4">Recent job activity</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="jobs" stroke="hsl(25 95% 53%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-1 text-gray-900">Revenue (KES)</h3>
              <p className="text-xs text-gray-400 mb-4">Platform earnings</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `KES ${v.toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="hsl(174 72% 40%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* Fundi status breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 text-gray-900">Fundi Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Approved", value: stats.approvedFundis, icon: CheckCircle, color: "text-green-600" },
              { label: "Pending", value: stats.pendingVerifications, icon: Clock, color: "text-yellow-600" },
              { label: "Rejected", value: stats.rejectedFundis, icon: XCircle, color: "text-red-600" },
              { label: "Suspended", value: stats.suspendedFundis, icon: AlertOctagon, color: "text-orange-600" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="text-center p-3 rounded-2xl bg-gray-50">
                <Icon className={`w-6 h-6 ${color} mx-auto mb-1`} />
                <p className="text-2xl font-bold text-gray-900">{loading ? '—' : value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
