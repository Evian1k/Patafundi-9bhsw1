/**
 * Staff Overview — the landing page for /staff/*.
 * Adapts to the user's role: shows different stat cards and quick links
 * based on what permissions they have.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Wrench, Package, DollarSign, AlertTriangle, Users, Activity } from "lucide-react";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { apiClient } from "@/lib/api";

interface Stats {
  fundis?: number;
  pendingFundis?: number;
  jobs?: number;
  revenue?: number;
  platformRevenue?: number;
  netProfit?: number;
  fraudAlerts?: number;
  users?: number;
  openDisputes?: number;
}

const fmt = (n: number | undefined): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
};

export default function StaffOverview() {
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<Stats>({});
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Use apiClient (configured with VITE_API_URL) — works on Vercel + dev
        const permData = await apiClient.getStaffPermissions().catch(() => ({ role: "", permissions: [] })) as { role: string; permissions: string[] };
        setRole(permData.role || "");
        setPermissions(new Set(permData.permissions || []));

        const promises: Promise<void>[] = [];
        if (permData.role === "super_admin" || permData.permissions?.includes("can_view_metrics")) {
          promises.push(
            apiClient.getAdminDashboard()
              .then((d: any) => {
                const s = d?.stats || {};
                setStats(prev => ({
                  ...prev,
                  fundis: s.fundis,
                  pendingFundis: s.pendingFundis,
                  jobs: s.jobs,
                  revenue: s.revenue,
                  platformRevenue: s.platformRevenue,
                  netProfit: s.netProfit,
                  users: s.users,
                  openDisputes: s.openDisputes,
                }));
              })
              .catch(() => {})
          );
        }
        if (permData.permissions?.includes("can_view_fraud_dashboard")) {
          promises.push(
            apiClient.getFraudDashboard()
              .then((d: any) => {
                const open = d?.dashboard?.fraudAlerts?.open ?? d?.fraudAlerts?.open ?? 0;
                setStats(prev => ({ ...prev, fraudAlerts: open }));
              })
              .catch(() => {})
          );
        }
        await Promise.all(promises);
      } catch {
        // ignore — dashboard shows "—" placeholders
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }

  const cards: Array<{ label: string; value: string | number; icon: React.ElementType; href?: string; perm?: string }> = [];
  if (role === "super_admin" || permissions.has("can_view_metrics")) {
    cards.push({ label: "Total Fundis", value: fmt(stats.fundis), icon: Wrench, href: "/staff/admin/fundis", perm: "can_view_fundis" });
    cards.push({ label: "Total Jobs", value: fmt(stats.jobs), icon: Package, href: "/staff/admin/jobs", perm: "can_view_all_jobs" });
    cards.push({ label: "Revenue (KES)", value: fmt(stats.revenue), icon: DollarSign, href: "/staff/finance", perm: "can_view_revenue" });
    cards.push({ label: "Users", value: fmt(stats.users), icon: Users, href: "/staff/admin/users", perm: "can_view_users" });
  }
  if (permissions.has("can_view_fraud_dashboard")) {
    cards.push({ label: "Open Fraud Alerts", value: fmt(stats.fraudAlerts), icon: AlertTriangle, href: "/staff/fraud" });
  }

  const containerVariants = reduceMotion ? {} : stagger;
  const itemVariants = reduceMotion ? {} : fadeUp;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.h1 variants={itemVariants} className="text-2xl font-bold text-slate-900 mb-1">
          Staff Dashboard
        </motion.h1>
        <motion.p variants={itemVariants} className="text-slate-500 mb-8 capitalize">
          Welcome back. You are signed in as <strong>{role.replace("_", " ")}</strong>.
        </motion.p>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            const content = (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                <div className="text-sm text-slate-500 mt-1">{card.label}</div>
              </div>
            );
            return card.href ? (
              <Link key={card.label} to={card.href}>{content}</Link>
            ) : (
              <div key={card.label}>{content}</div>
            );
          })}
        </motion.div>

        {cards.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Your role doesn't have dashboard metrics enabled. Use the sidebar to navigate to your assigned areas.
          </div>
        )}
      </motion.div>
    </div>
  );
}
