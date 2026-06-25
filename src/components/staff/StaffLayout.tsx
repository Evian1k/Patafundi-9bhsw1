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
  Package, Activity, ScrollText, LogOut, Menu, X, Gift,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useReducedMotion } from "@/lib/motion";
import { apiClient } from "@/lib/api";

const STAFF_NAV = [
  {
    section: "Operations",
    items: [
      { label: "Overview", href: "/staff/admin", icon: Shield, permission: "can_view_metrics", roles: ["super_admin", "admin", "ops_manager"] },
      { label: "Live Operations", href: "/staff/operations", icon: Activity, permission: "can_view_all_jobs", roles: ["super_admin", "admin", "ops_manager", "dispatch_team", "support_agent"] },
      { label: "Dispatch Dashboard", href: "/staff/dispatch/dashboard", icon: Package, permission: "can_view_dispatch_dashboard", roles: ["super_admin", "admin", "ops_manager", "dispatch_team"] },
      { label: "Fundis", href: "/staff/admin/fundis", icon: Wrench, permission: "can_view_fundis", roles: ["super_admin", "admin", "ops_manager", "dispatch_team", "support_agent"] },
      { label: "Jobs", href: "/staff/admin/jobs", icon: Package, permission: "can_view_all_jobs", roles: ["super_admin", "admin", "ops_manager", "dispatch_team", "support_agent"] },
      { label: "Users", href: "/staff/admin/users", icon: Users, permission: "can_view_users", roles: ["super_admin", "admin", "ops_manager", "support_agent"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Finance Dashboard", href: "/staff/finance/dashboard", icon: DollarSign, permission: "can_view_finance_dashboard", roles: ["super_admin", "finance_team"] },
      { label: "Payments", href: "/staff/finance", icon: DollarSign, permission: "can_view_payments", roles: ["super_admin", "finance_team"] },
      { label: "Revenue", href: "/staff/finance/revenue", icon: DollarSign, permission: "can_view_revenue", roles: ["super_admin", "finance_team"] },
      { label: "Commission Control", href: "/staff/commission", icon: DollarSign, permission: "can_manage_system", roles: ["super_admin"] },
      { label: "Referral Campaigns", href: "/staff/referrals", icon: Gift, permission: "can_view_referral_analytics", roles: ["super_admin", "finance_team", "fraud_analyst"] },
      { label: "Loyalty Campaigns", href: "/staff/loyalty", icon: Gift, permission: "can_enable_disable_loyalty", roles: ["super_admin"] },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      { label: "Fraud Dashboard", href: "/staff/fraud/dashboard", icon: AlertTriangle, permission: "can_view_fraud_dashboard", roles: ["super_admin", "fraud_analyst"] },
      { label: "Fraud Alerts", href: "/staff/fraud", icon: AlertTriangle, permission: "can_view_fraud_dashboard", roles: ["super_admin", "fraud_analyst"] },
      { label: "Support Dashboard", href: "/staff/support/dashboard", icon: Headphones, permission: "can_view_support_dashboard", roles: ["super_admin", "ops_manager", "support_agent"] },
      { label: "Disputes", href: "/staff/support/disputes", icon: Headphones, permission: "can_view_disputes", roles: ["super_admin", "ops_manager", "support_agent"] },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Executive Dashboard", href: "/staff/executive", icon: Shield, permission: "can_view_executive_dashboard", roles: ["super_admin"] },
      { label: "Growth Dashboard", href: "/staff/growth", icon: Activity, permission: "can_view_growth_dashboard", roles: ["super_admin"] },
      { label: "AI Command Center", href: "/staff/ai", icon: AlertTriangle, permission: "can_view_ai_command_center", roles: ["super_admin"] },
      { label: "Staff Management", href: "/staff/staff-mgmt", icon: Users, permission: "can_manage_roles", roles: ["super_admin"] },
      { label: "Emergency Controls", href: "/staff/emergency", icon: Shield, permission: "can_use_emergency_controls", roles: ["super_admin"] },
      { label: "Staff Productivity", href: "/staff/productivity", icon: Users, permission: "can_view_staff_productivity", roles: ["super_admin", "devops_engineer"] },
      { label: "Internal Messages", href: "/staff/messages", icon: Headphones, permission: "can_use_internal_messaging", roles: ["super_admin", "admin", "ops_manager", "support_agent", "fraud_analyst", "finance_team", "dispatch_team", "devops_engineer", "auditor"] },
      { label: "Security Center", href: "/staff/security", icon: Shield, permission: "can_view_logs", roles: ["super_admin", "auditor", "devops_engineer"] },
      { label: "System Settings", href: "/staff/system", icon: Shield, permission: "can_manage_system", roles: ["super_admin", "devops_engineer"] },
    ],
  },
  {
    section: "System",
    items: [
      { label: "DevOps Dashboard", href: "/staff/devops/dashboard", icon: Activity, permission: "can_view_devops_dashboard", roles: ["super_admin", "devops_engineer"] },
      { label: "Audit Logs", href: "/staff/audit", icon: ScrollText, permission: "can_view_logs", roles: ["super_admin", "auditor", "devops_engineer"] },
      { label: "System Health", href: "/staff/devops", icon: Activity, permission: "can_view_health", roles: ["super_admin", "devops_engineer"] },
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
        const data = await apiClient.getStaffPermissions() as { role: string; permissions: string[] };
        if (!data || !data.role) {
          navigate("/staff/login");
          return;
        }
        // Security: if a non-staff role (customer/fundi) somehow reaches here,
        // redirect them to the customer auth page (not staff login)
        const staffRoles = ["super_admin", "admin", "ops_manager", "support_agent", "fraud_analyst", "finance_team", "dispatch_team", "devops_engineer", "auditor"];
        if (!staffRoles.includes(data.role)) {
          await apiClient.logout().catch(() => {});
          navigate("/auth", { replace: true });
          return;
        }
        setRole(data.role);
        setPermissions(new Set(data.permissions || []));
      } catch {
        navigate("/staff/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleSignOut = async () => {
    // Security: actually log out (revoke refresh token + clear cookies)
    // before redirecting. This prevents the back button from re-entering
    // the staff dashboard with a still-valid session.
    await apiClient.logout().catch(() => {});
    navigate("/staff/login", { replace: true });
  };

  const canSee = (item: { permission: string; roles: string[] }) => {
    if (role === "super_admin") return true;
    if (!item.roles.includes(role)) return false;
    return permissions.has(item.permission);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400">Loading staff dashboard…</div>
      </div>
    );
  }

  if (role === "customer" || role === "fundi" || role === "fundi_pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
          <p className="text-slate-600 mt-2">This area is for staff members only.</p>
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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar — desktop */}
      <motion.aside
        initial={sidebarVariants.initial}
        animate={sidebarVariants.animate}
        className="hidden md:flex w-64 flex-col bg-slate-900 text-slate-100 fixed inset-y-0 left-0 z-30"
      >
        <div className="p-4 border-b border-slate-800">
          <BrandLogo size="sm" />
          <div className="mt-2 text-xs text-slate-400">
            Staff Console · <span className="text-slate-300 capitalize">{role.replace("_", " ")}</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {STAFF_NAV.map((section) => {
            const visibleItems = section.items.filter(canSee);
            if (!visibleItems.length) return null;
            return (
              <div key={section.section} className="mb-6">
                <div className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                        active ? "bg-primary text-white" : "text-slate-300 hover:bg-slate-800"
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
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </motion.aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-slate-900 text-white px-4 h-14 flex items-center justify-between">
        <BrandLogo size="sm" />
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-2">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="absolute right-0 top-14 bottom-0 w-64 bg-slate-900 text-slate-100 p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {STAFF_NAV.map((section) => {
              const visibleItems = section.items.filter(canSee);
              if (!visibleItems.length) return null;
              return (
                <div key={section.section} className="mb-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    {section.section}
                  </div>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
            {/* Mobile sign-out */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
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
