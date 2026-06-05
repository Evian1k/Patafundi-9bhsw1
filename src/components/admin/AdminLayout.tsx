import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, Shield, TrendingUp, BarChart3,
  Settings, LogOut, Menu, Briefcase, CreditCard,
  AlertTriangle, FileText, Scale, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { realtimeService } from "@/services/realtime";
import { toast } from "sonner";
import { BrandLogo } from "@/assets/logo";

interface AdminLayoutProps {
  children: React.ReactNode;
  /** Optional badge count to show on the Disputes menu item */
  disputeBadge?: number;
}

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard", color: "text-blue-500" },
  { icon: Shield, label: "Fundi Verification", path: "/admin/fundis", color: "text-green-500" },
  { icon: Users, label: "Customers", path: "/admin/customers", color: "text-purple-500" },
  { icon: Briefcase, label: "Jobs", path: "/admin/jobs", color: "text-orange-500" },
  { icon: CreditCard, label: "Payments", path: "/admin/payments", color: "text-emerald-500" },
  { icon: Scale, label: "Disputes", path: "/admin/disputes", color: "text-violet-500" },
  { icon: AlertTriangle, label: "Security", path: "/admin/security", color: "text-red-500" },
  { icon: BarChart3, label: "Reports", path: "/admin/reports", color: "text-cyan-500" },
  { icon: Settings, label: "Settings", path: "/admin/settings", color: "text-gray-500" },
  { icon: FileText, label: "Audit Logs", path: "/admin/audit-logs", color: "text-indigo-500" },
];

export default function AdminLayout({ children, disputeBadge }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [localDisputeBadge, setLocalDisputeBadge] = useState(disputeBadge ?? 0);

  // Sync external badge prop
  useEffect(() => {
    if (disputeBadge != null) setLocalDisputeBadge(disputeBadge);
  }, [disputeBadge]);

  // Real-time: show badge whenever a new dispute is opened from any admin page
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) realtimeService.connect(token);

    const onDispute = () => {
      // Only show badge if not already on disputes page
      if (!location.pathname.includes("/admin/disputes")) {
        setLocalDisputeBadge((n) => n + 1);
        toast("New dispute opened", {
          description: "A user has filed a dispute requiring attention.",
          action: {
            label: "View",
            onClick: () => { navigate("/admin/disputes"); setLocalDisputeBadge(0); },
          },
        });
      }
    };

    realtimeService.on("dispute:opened", onDispute);
    return () => realtimeService.off("dispute:opened", onDispute);
  }, [navigate, location.pathname]);

  // Clear badge when navigating to disputes page
  useEffect(() => {
    if (location.pathname.includes("/admin/disputes")) {
      setLocalDisputeBadge(0);
    }
  }, [location.pathname]);

  // Server-side auth verification
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) { navigate("/admin/login"); return; }
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "admin") {
          localStorage.removeItem("auth_token");
          navigate("/admin/login");
        }
      } catch {
        localStorage.removeItem("auth_token");
        navigate("/admin/login");
      }
    })();
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await apiClient.logout();
      toast.success("Logged out successfully");
    } catch { /* ignore */ }
    realtimeService.disconnect();
    navigate("/admin/login");
  }, [navigate]);

  const isActive = (path: string) => location.pathname === path;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-3 px-4 h-14 border-b border-slate-700/50 ${!sidebarOpen ? "justify-center" : ""}`}>
        <BrandLogo size="sm" iconOnly={!sidebarOpen} linkTo={false} />
        {sidebarOpen && (
          <p className="text-slate-400 text-xs leading-none">Admin Panel</p>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const isDisputes = item.path === "/admin/disputes";
          const showBadge = isDisputes && localDisputeBadge > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => {
                setMobileOpen(false);
                if (isDisputes) setLocalDisputeBadge(0);
              }}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                active
                  ? "bg-primary/20 border border-primary/30 text-white"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
              } ${!sidebarOpen ? "justify-center" : ""}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <div className="relative shrink-0">
                <Icon className={`w-4 h-4 ${active ? "text-primary" : item.color}`} />
                {showBadge && !sidebarOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-bold">
                    {localDisputeBadge > 9 ? "9+" : localDisputeBadge}
                  </span>
                )}
              </div>

              {sidebarOpen && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold px-1">
                      {localDisputeBadge > 9 ? "9+" : localDisputeBadge}
                    </span>
                  )}
                  {active && !showBadge && (
                    <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/60" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 pb-4">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-700/50 hover:text-white transition-all text-sm ${!sidebarOpen ? "justify-center" : ""}`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-slate-900 transition-all duration-300 ${sidebarOpen ? "w-56" : "w-16"} shrink-0`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 bg-slate-900 flex flex-col">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => { setSidebarOpen((s) => !s); setMobileOpen((s) => !s); }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-4 h-4 text-gray-500" />
          </button>
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">
              {MENU_ITEMS.find((m) => m.path === location.pathname)?.label || "Admin Panel"}
            </p>
          </div>
          {localDisputeBadge > 0 && !location.pathname.includes("/admin/disputes") && (
            <Link
              to="/admin/disputes"
              onClick={() => setLocalDisputeBadge(0)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors"
            >
              <Scale className="w-3.5 h-3.5" />
              {localDisputeBadge} dispute{localDisputeBadge > 1 ? "s" : ""}
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4 text-gray-500" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
