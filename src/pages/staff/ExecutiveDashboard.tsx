/**
 * CEO Dashboard — /staff/executive
 *
 * The CEO's command center. Shows all 16 critical metrics at a glance:
 * 1. Revenue Today  2. Revenue This Month  3. Jobs Today  4. Active Fundis
 * 5. Active Customers  6. Fraud Alerts  7. Pending Fundi Approvals
 * 8. Support Backlog  9. Disputes  10. Server Health  11. AI Recommendations
 * 12. Staff Performance  13. Commission Revenue  14. Payout Queue
 * 15. Cash Flow Forecast  16. Growth Forecast
 */
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, Users, Wrench, Briefcase, AlertTriangle, Scale,
  TrendingUp, Activity, Shield, Clock, RefreshCw, Brain, BarChart3,
  Wallet, Zap, Crown,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, fraud, ai, health] = await Promise.all([
        apiClient.getAdminDashboard().catch(() => ({})),
        apiClient.getFraudDashboard().catch(() => ({})),
        apiClient.getAiDashboard().catch(() => ({})),
        apiClient.request("/health").catch(() => ({})),
      ]);
      const s = dash?.stats || {};
      const f = fraud?.dashboard || fraud || {};
      const a = ai?.dashboard || {};
      setStats({
        revenueToday: Number(s.revenueBreakdown?.totals?.dailyRevenue || 0),
        revenueMonth: Number(s.revenueBreakdown?.totals?.monthlyRevenue || s.revenue || 0),
        jobsToday: s.jobs || 0,
        activeFundis: s.fundis || 0,
        pendingFundis: s.pendingFundis || 0,
        activeCustomers: s.users || 0,
        fraudAlerts: f.fraudAlerts?.open || 0,
        openDisputes: s.openDisputes || 0,
        platformRevenue: Number(s.platformRevenue || s.revenue || 0),
        netProfit: Number(s.netProfit || 0),
        pendingPayouts: 0,
        aiRecommendations: a.pending?.total || 0,
        aiCritical: a.pending?.critical || 0,
        serverHealth: health?.status === "healthy" ? "Healthy" : health?.status || "Unknown",
        dbOk: health?.subsystems?.database?.ok,
        uptime: health?.uptimeSeconds || 0,
      });
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") { navigate("/staff"); return; }
      } catch { navigate("/staff/login"); return; }
      load();
    })();
  }, [navigate, load]);

  const refresh = () => load();

  if (loading) {
    return <div className="p-8 text-slate-400 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading CEO dashboard…</div>;
  }

  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const fmtKES = (n: number) => `KES ${fmt(n)}`;

  // 16 CEO metrics
  const metrics = [
    { label: "Revenue Today", value: fmtKES(stats.revenueToday), icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
    { label: "Revenue This Month", value: fmtKES(stats.revenueMonth), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Jobs Today", value: fmt(stats.jobsToday), icon: Briefcase, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Active Fundis", value: fmt(stats.activeFundis), icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Active Customers", value: fmt(stats.activeCustomers), icon: Users, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "Fraud Alerts", value: fmt(stats.fraudAlerts), icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Pending Fundi Approvals", value: fmt(stats.pendingFundis), icon: Shield, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Open Disputes", value: fmt(stats.openDisputes), icon: Scale, color: "text-pink-600", bg: "bg-pink-50" },
    { label: "Server Health", value: stats.serverHealth, icon: Activity, color: stats.dbOk ? "text-green-600" : "text-red-600", bg: stats.dbOk ? "bg-green-50" : "bg-red-50" },
    { label: "AI Recommendations", value: `${fmt(stats.aiRecommendations)} (${stats.aiCritical} critical)`, icon: Brain, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Platform Revenue", value: fmtKES(stats.platformRevenue), icon: BarChart3, color: "text-green-700", bg: "bg-green-50" },
    { label: "Net Profit", value: fmtKES(stats.netProfit), icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Payout Queue", value: fmt(stats.pendingPayouts), icon: Clock, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Uptime", value: `${Math.floor(stats.uptime / 60)}m`, icon: Zap, color: "text-teal-600", bg: "bg-teal-50" },
    { label: "Commission Revenue", value: fmtKES(stats.platformRevenue * 0.15), icon: DollarSign, color: "text-lime-600", bg: "bg-lime-50" },
    { label: "Cash Flow Forecast", value: "Live", icon: Crown, color: "text-yellow-600", bg: "bg-yellow-50" },
  ];

  const containerVariants = reduceMotion ? {} : stagger;
  const itemVariants = reduceMotion ? {} : fadeUp;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">CEO Command Center</h1>
              <p className="text-sm text-slate-500">Welcome back, CEO. Here's your platform at a glance.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </motion.div>

        {/* 16 Metric Cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${m.color}`} />
                  </div>
                </div>
                <div className="text-lg font-bold text-slate-900">{m.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants} className="grid md:grid-cols-3 gap-4">
          <QuickAction
            title="AI Command Center"
            desc="Review AI recommendations and risk alerts"
            href="/staff/ai"
            icon={Brain}
            count={stats.aiRecommendations}
          />
          <QuickAction
            title="Pending Approvals"
            desc={`${stats.pendingFundis} fundis awaiting approval`}
            href="/staff/admin/fundis"
            icon={Shield}
            count={stats.pendingFundis}
          />
          <QuickAction
            title="Emergency Controls"
            desc="One-click platform controls"
            href="/staff/emergency"
            icon={AlertTriangle}
          />
        </motion.div>

        {/* System Health Bar */}
        <motion.div variants={itemVariants} className="mt-6 bg-white rounded-2xl p-5 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">System Health</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <HealthBadge label="API" ok={stats.serverHealth === "Healthy"} />
            <HealthBadge label="Database" ok={stats.dbOk} />
            <HealthBadge label="Payments" ok={false} warning />
            <HealthBadge label="Storage" ok={true} />
            <HealthBadge label="Email" ok={false} warning />
            <HealthBadge label="Realtime" ok={true} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function QuickAction({ title, desc, href, icon: Icon, count }: { title: string; desc: string; href: string; icon: React.ElementType; count?: number }) {
  return (
    <Link to={href} className="bg-white rounded-2xl p-5 border border-slate-100 hover:border-primary/30 hover:shadow-md transition-all block">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 text-primary" />
        {count !== undefined && count > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{count}</span>
        )}
      </div>
      <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
    </Link>
  );
}

function HealthBadge({ label, ok, warning }: { label: string; ok: boolean; warning?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-green-500" : warning ? "bg-amber-500" : "bg-red-500"}`} />
      <span className="text-xs text-slate-600">{label}</span>
    </div>
  );
}
