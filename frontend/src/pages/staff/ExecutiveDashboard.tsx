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
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

// Key names mirror adminController.dashboard() exactly — every card on this
// page must read a field the backend really sends.
interface ExecStats {
  totalUsers?: number;
  totalFundis?: number;
  jobs?: number;
  totalRevenue?: number;
  platformRevenue?: number;
  netProfit?: number;
  openDisputes?: number;
  pendingFundis?: number;
  fraudAlerts?: number;
  escrowPending?: number;
  payoutsPending?: number;
  payoutsPendingCount?: number;
  activeJobs?: number;
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<ExecStats>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [role, setRole] = useState("");
  const [statsError, setStatsError] = useState(false);
  const [health, setHealth] = useState("…");

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
      setStatsError(false);
    } catch {
      // Surface the failure honestly instead of silently showing zeros.
      setStatsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real system health from /health/extended — it runs a live DB query, so a
  // 200 means the database answers and 4xx/5xx means degraded or offline.
  const fetchHealth = useCallback(async () => {
    try {
      const data = await apiClient.request('/health/extended', { includeAuth: true }) as { db?: { ok?: boolean } };
      setHealth(data?.db?.ok !== false ? 'Online' : 'Degraded');
    } catch {
      setHealth('Offline');
    }
  }, []);

  useEffect(() => {
    if (role === "super_admin") {
      fetchStats();
      fetchHealth();
      const interval = setInterval(fetchStats, 30_000);
      const healthInterval = setInterval(fetchHealth, 60_000);
      return () => {
        clearInterval(interval);
        clearInterval(healthInterval);
      };
    }
  }, [role, fetchStats, fetchHealth]);

  if (role !== "super_admin") {
    return <div className="min-h-screen flex items-center justify-center bg-muted/40 text-muted-foreground">Verifying access…</div>;
  }

  const cards = [
    { label: "Total Revenue", value: formatMoney(stats.totalRevenue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Platform Profit", value: formatMoney(stats.platformRevenue), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Escrow Balance", value: formatMoney(stats.escrowPending), icon: Scale, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Pending Payouts", value: formatMoney(stats.payoutsPending), icon: Clock, color: "text-primary", bg: "bg-primary/10" },
    { label: "Total Users", value: stats.totalUsers || 0, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Total Fundis", value: stats.totalFundis || 0, icon: Wrench, color: "text-primary", bg: "bg-primary/10" },
    { label: "Active Jobs", value: stats.activeJobs || 0, icon: Briefcase, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Pending Approvals", value: stats.pendingFundis || 0, icon: Shield, color: "text-primary", bg: "bg-primary/10" },
    { label: "Open Disputes", value: stats.openDisputes || 0, icon: Scale, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Fraud Alerts", value: stats.fraudAlerts || 0, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "System Health", value: health, icon: Activity, color: health === "Online" ? "text-emerald-600" : health === "Degraded" ? "text-amber-600" : "text-red-600", bg: health === "Online" ? "bg-emerald-500/10" : health === "Degraded" ? "bg-amber-500/10" : "bg-red-500/10" },
    { label: "Total Jobs", value: stats.jobs || 0, icon: Briefcase, color: "text-muted-foreground", bg: "bg-muted" },
  ];

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Executive Overview</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Platform-wide metrics · {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {statsError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Live metrics could not be loaded just now - the figures below may be stale. Retry with the Refresh button.
          </div>
        )}

        {/* Stat cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-card rounded-2xl p-5 shadow-sm border border-border/60">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="text-xl font-bold text-foreground">{card.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/staff/admin/fundis")}
            className="bg-card rounded-2xl p-5 shadow-sm border border-border/60 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5 text-cyan-600" />
              <h3 className="font-semibold text-foreground">Fundi Approvals</h3>
            </div>
            <p className="text-sm text-muted-foreground">Review pending fundi applications and verification documents.</p>
          </button>

          <button
            onClick={() => navigate("/staff/fraud")}
            className="bg-card rounded-2xl p-5 shadow-sm border border-border/60 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-semibold text-foreground">Fraud Center</h3>
            </div>
            <p className="text-sm text-muted-foreground">Review fraud alerts, suspicious activity, and risk scores.</p>
          </button>

          <button
            onClick={() => navigate("/staff/finance")}
            className="bg-card rounded-2xl p-5 shadow-sm border border-border/60 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-foreground">Finance Center</h3>
            </div>
            <p className="text-sm text-muted-foreground">View payments, escrow, payouts, and revenue reports.</p>
          </button>

          <button
            onClick={() => navigate("/staff/audit")}
            className="bg-card rounded-2xl p-5 shadow-sm border border-border/60 hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-foreground">Audit Logs</h3>
            </div>
            <p className="text-sm text-muted-foreground">Review all staff actions, role changes, and system events.</p>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
