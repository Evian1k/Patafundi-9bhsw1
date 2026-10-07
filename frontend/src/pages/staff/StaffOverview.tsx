/**
 * Staff Overview — the landing page for /staff/*.
 * Adapts to the user's role: shows different stat cards and quick links
 * based on what permissions they have.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Wrench, Package, DollarSign, AlertTriangle, Users, Activity } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";

interface Stats {
  fundis?: number;
  jobs?: number;
  revenue?: number;
  fraudAlerts?: number;
  users?: number;
}

export default function StaffOverview() {
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<Stats>({});
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // apiClient everywhere: raw relative fetch("/api/…") breaks in
        // production (SPA rewrite serves index.html) and skips auth headers.
        const permData = await apiClient.request("/staff/me/permissions") as {
          role?: string;
          permissions?: string[];
        };
        setRole(permData.role || "");
        const perms = new Set(permData.permissions || []);
        setPermissions(perms);

        // Fetch stats based on permissions
        const promises: Promise<void>[] = [];
        if (permData.role === "super_admin" || perms.has("can_view_metrics")) {
          promises.push(
            apiClient.request("/admin/dashboard")
              .then((d) => {
                const stats = (d as { stats?: Record<string, number> }).stats;
                setStats((s) => ({ ...s, fundis: stats?.fundis, jobs: stats?.jobs, revenue: stats?.revenue, users: stats?.users }));
              })
              .catch(() => { setStatsError(true); })
          );
        }
        if (perms.has("can_view_fraud_dashboard")) {
          promises.push(
            apiClient.request("/staff/fraud/dashboard")
              .then((d) => {
                const dashboard = (d as { dashboard?: { fraudAlerts?: { open?: number } } }).dashboard;
                setStats((s) => ({ ...s, fraudAlerts: dashboard?.fraudAlerts?.open }));
              })
              .catch(() => { setStatsError(true); })
          );
        }
        await Promise.all(promises);
      } catch {
        // permissions fetch failed — the layout will handle re-auth
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-4 w-80 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const cards: Array<{ label: string; value: string | number; icon: React.ElementType; href?: string; perm?: string }> = [];
  if (role === "super_admin" || permissions.has("can_view_metrics")) {
    cards.push({ label: "Total Fundis", value: String(stats.fundis ?? 0), icon: Wrench, href: "/staff/admin/fundis", perm: "can_view_fundis" });
    cards.push({ label: "Total Jobs", value: String(stats.jobs ?? 0), icon: Package, href: "/staff/admin/jobs", perm: "can_view_all_jobs" });
    cards.push({ label: "Revenue", value: formatMoney(stats.revenue), icon: DollarSign, href: "/staff/finance", perm: "can_view_revenue" });
    cards.push({ label: "Users", value: String(stats.users ?? 0), icon: Users, href: "/staff/admin/users", perm: "can_view_logs" });
  }
  if (permissions.has("can_view_fraud_dashboard")) {
    cards.push({ label: "Open Fraud Alerts", value: String(stats.fraudAlerts ?? 0), icon: AlertTriangle, href: "/staff/fraud" });
  }

  const containerVariants = reduceMotion ? {} : stagger;
  const itemVariants = reduceMotion ? {} : fadeUp;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.h1 variants={itemVariants} className="text-2xl font-bold text-foreground mb-1">
          Staff Dashboard
        </motion.h1>
        <motion.p variants={itemVariants} className="text-muted-foreground mb-8 capitalize">
          Welcome back. You are signed in as <strong>{role.replace("_", " ")}</strong>.
        </motion.p>

        {statsError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Some metrics could not be loaded just now - the cards below may show zeros. Refresh the page to retry.
          </div>
        )}

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            const content = (
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground">{card.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{card.label}</div>
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
          <div className="bg-card rounded-2xl p-8 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            Your role doesn't have dashboard metrics enabled. Use the sidebar to navigate to your assigned areas.
          </div>
        )}
      </motion.div>
    </div>
  );
}
