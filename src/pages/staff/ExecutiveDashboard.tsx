/**
 * Super Admin Executive Dashboard — /staff/executive
 *
 * CEO-level overview with revenue, growth, operations, and system health.
 * Only accessible by super_admin role.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, Users, Wrench, Briefcase, AlertTriangle, Scale,
  TrendingUp, Activity, Shield, Clock, RefreshCw,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";

interface ExecStats {
  totalUsers?: number;
  totalFundis?: number;
  totalJobs?: number;
  totalRevenue?: number;
  platformRevenue?: number;
  netProfit?: number;
  openDisputes?: number;
  pendingFundis?: number;
  fraudAlerts?: number;
  escrowBalance?: number;
  pendingPayouts?: number;
  activeJobs?: number;
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<ExecStats>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [role, setRole] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") {
          navigate("/staff");
          return;
        }
        setRole(me.user.role);
      } catch {
        navigate("/staff/login");
        return;
      }
    })();
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.request('/admin/dashboard-stats', { includeAuth: true }) as {
        stats?: ExecStats;
      };
      setStats(data.stats || {});
      setLastRefresh(new Date());
    } catch {
      // ignore — keep existing stats
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === "super_admin") {
      fetchStats();
      const interval = setInterval(fetchStats, 30_000);
      return () => clearInterval(interval);
    }
  }, [role, fetchStats]);

  if (role !== "super_admin") {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Verifying access…</div>;
  }

  const formatKES = (amount: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(amount || 0);

  const cards = [
    { label: "Total Revenue", value: formatKES(stats.totalRevenue || 0), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Platform Profit", value: formatKES(stats.platformRevenue || 0), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Escrow Balance", value: formatKES(stats.escrowBalance || 0), icon: Scale, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Pending Payouts", value: formatKES(stats.pendingPayouts || 0), icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Total Users", value: stats.totalUsers || 0, icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Total Fundis", value: stats.totalFundis || 0, icon: Wrench, color: "text-green-600", bg: "bg-green-50" },
    { label: "Active Jobs", value: stats.activeJobs || 0, icon: Briefcase, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Pending Approvals", value: stats.pendingFundis || 0, icon: Shield, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "Open Disputes", value: stats.openDisputes || 0, icon: Scale, color: "text-red-600", bg: "bg-red-50" },
    { label: "Fraud Alerts", value: stats.fraudAlerts || 0, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "System Health", value: "Online", icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Jobs", value: stats.totalJobs || 0, icon: Briefcase, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Executive Overview</h1>
            <p className="text-slate-500 text-sm mt-1">
              Platform-wide metrics · {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {/* Stat cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="text-xl font-bold text-slate-900">{card.value}</div>
                <div className="text-xs text-slate-500 mt-1">{card.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/staff/admin/fundis")}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5 text-cyan-600" />
              <h3 className="font-semibold text-slate-900">Fundi Approvals</h3>
            </div>
            <p className="text-sm text-slate-500">Review pending fundi applications and verification documents.</p>
          </button>

          <button
            onClick={() => navigate("/staff/fraud")}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-semibold text-slate-900">Fraud Center</h3>
            </div>
            <p className="text-sm text-slate-500">Review fraud alerts, suspicious activity, and risk scores.</p>
          </button>

          <button
            onClick={() => navigate("/staff/finance")}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-slate-900">Finance Center</h3>
            </div>
            <p className="text-sm text-slate-500">View payments, escrow, payouts, and revenue reports.</p>
          </button>

          <button
            onClick={() => navigate("/staff/audit")}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-slate-900">Audit Logs</h3>
            </div>
            <p className="text-sm text-slate-500">Review all staff actions, role changes, and system events.</p>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
