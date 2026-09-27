/**
 * Staff Dashboard Layout — shared shell for all internal staff dashboards.
 *
 * Each staff role gets their own dashboard route:
 *   /staff/admin        → super_admin + admin (ops)
 *   /staff/support      → support_agent
 *   /staff/fraud        → fraud_analyst
 *   /staff/finance      → finance_team
 *   /staff/dispatch     → dispatch_team
 *   /staff/devops       → devops_engineer
 *   /staff/audit        → auditor (read-only)
 *
 * The layout fetches the user's permissions from /api/staff/me/permissions
 * and hides nav items the user doesn't have permission for. Route access
 * is ALSO enforced server-side via requirePermission() middleware — the
 * frontend gating is UX only, not a security boundary.
 */

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield, Users, Wrench, DollarSign, AlertTriangle, Headphones,
  Package, Activity, ScrollText, LogOut, Menu, X, TrendingUp,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { apiClient } from "@/lib/api";
import NotificationBell from "@/components/system/NotificationBell";
import { useReducedMotion } from "@/lib/motion";

const STAFF_NAV = [
  {
    section: "Operations",
    items: [
      { label: "Overview", href: "/staff/admin", icon: Shield, permission: "can_view_metrics", roles: ["super_admin", "admin"] },
      { label: "Live Operations", href: "/staff/operations", icon: Activity, permission: "can_view_all_jobs", roles: ["super_admin", "admin", "dispatch_team", "support_agent"] },
      { label: "Fundis", href: "/staff/admin/fundis", icon: Wrench, permission: "can_view_fundis", roles: ["super_admin", "admin", "dispatch_team", "support_agent"] },
      { label: "Jobs", href: "/staff/admin/jobs", icon: Package, permission: "can_view_all_jobs", roles: ["super_admin", "admin", "dispatch_team", "support_agent"] },
      { label: "User Activity", href: "/staff/admin/users", icon: Users, permission: "can_view_users", roles: ["super_admin", "admin", "support_agent"] },
      { label: "Executive Dashboard", href: "/staff/executive", icon: TrendingUp, permission: "can_view_executive_dashboard", roles: ["super_admin"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Payments", href: "/staff/finance", icon: DollarSign, permission: "can_view_payments", roles: ["super_admin", "admin", "finance_team"] },
      { label: "Revenue", href: "/staff/finance/revenue", icon: DollarSign, permission: "can_view_revenue", roles: ["super_admin", "admin", "finance_team"] },
      { label: "Commission Control", href: "/staff/commission", icon: DollarSign, permission: "can_manage_system", roles: ["super_admin"] },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      { label: "Fraud Dashboard", href: "/staff/fraud", icon: AlertTriangle, permission: "can_view_fraud_dashboard", roles: ["super_admin", "admin", "fraud_analyst"] },
      { label: "Disputes", href: "/staff/support/disputes", icon: Headphones, permission: "can_view_disputes", roles: ["super_admin", "admin", "support_agent"] },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Staff Management", href: "/staff/staff-mgmt", icon: Users, permission: "can_manage_roles", roles: ["super_admin"] },
      { label: "AI Command Center", href: "/staff/ai", icon: AlertTriangle, permission: "can_view_fraud_dashboard", roles: ["super_admin"] },
      { label: "Security Center", href: "/staff/security", icon: Shield, permission: "can_view_logs", roles: ["super_admin", "admin", "auditor", "devops_engineer"] },
      { label: "System Settings", href: "/staff/system", icon: Shield, permission: "can_manage_system", roles: ["super_admin"] },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Audit Logs", href: "/staff/audit", icon: ScrollText, permission: "can_view_logs", roles: ["super_admin", "admin", "auditor", "devops_engineer"] },
      { label: "System Health", href: "/staff/devops", icon: Activity, permission: "can_view_health", roles: ["super_admin", "admin", "devops_engineer"] },
    ],
  },
];

export default function StaffLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // apiClient (NOT raw fetch): production serves the SPA from a CDN and
        // relative /api paths rewrite to index.html — apiClient builds the
        // absolute API URL and handles auth headers + 401 refresh.
        const data = await apiClient.request("/staff/me/permissions") as {
          role?: string;
          permissions?: string[];
        };
        if (!data?.role) {
          navigate("/auth");
          return;
        }
        setRole(data.role);
        setPermissions(new Set(data.permissions || []));
      } catch {
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const canSee = (item: { permission: string; roles: string[] }) => {
    if (role === "super_admin") return true;
    if (!item.roles.includes(role)) return false;
    return permissions.has(item.permission);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading staff dashboard…</div>
      </div>
    );
  }

  if (role === "customer" || role === "fundi" || role === "fundi_pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">This area is for staff members only.</p>
          <Link to="/dashboard" className="mt-4 inline-block text-primary hover:underline">
            Go to your dashboard →
          </Link>
        </div>
      </div>
    );
  }

  const sidebarVariants = reduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, x: -20 }, animate: { opacity: 1, x: 0 } };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar — desktop */}
      <motion.aside
        initial={sidebarVariants.initial}
        animate={sidebarVariants.animate}
        className="hidden md:flex w-64 flex-col bg-[hsl(168_40%_9%)] text-emerald-50/90 fixed inset-y-0 left-0 z-30"
      >
        <div className="p-4 border-b border-white/10">
          <BrandLogo size="sm" />
          <div className="mt-2 text-xs text-emerald-200/70">
            Staff Console · <span className="text-emerald-100 capitalize">{role.replace("_", " ")}</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {STAFF_NAV.map((section) => {
            const visibleItems = section.items.filter(canSee);
            if (!visibleItems.length) return null;
            return (
              <div key={section.section} className="mb-6">
                <div className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/50">
                  {section.section}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        active ? "bg-primary text-white shadow-glow" : "text-emerald-100/80 hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => navigate("/auth")}
            className="flex items-center gap-2 text-sm text-emerald-200/70 hover:text-white"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
          <NotificationBell className="[&_button]:text-emerald-100/80 [&_button:hover]:bg-white/10" />
        </div>
      </motion.aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-[hsl(168_40%_9%)] text-white px-4 h-14 flex items-center justify-between">
        <BrandLogo size="sm" />
        <div className="flex items-center gap-1">
          <NotificationBell className="text-white [&_button]:text-white" />
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="absolute right-0 top-14 bottom-0 w-64 bg-[hsl(168_40%_9%)] text-emerald-50/90 p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {STAFF_NAV.map((section) => {
              const visibleItems = section.items.filter(canSee);
              if (!visibleItems.length) return null;
              return (
                <div key={section.section} className="mb-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200/50 mb-2">
                    {section.section}
                  </div>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-emerald-100/80 hover:bg-white/10 rounded-lg"
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
