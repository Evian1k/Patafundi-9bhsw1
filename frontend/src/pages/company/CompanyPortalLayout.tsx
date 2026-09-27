/**
 * Company Portal layout (spec §8) — business dashboard shell.
 * Desktop: sidebar · Mobile: top bar + bottom navigation.
 * Access: any active company member; role-gating happens per-page and is
 * enforced server-side by requireCompanyMember.
 */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Briefcase, Building2, CalendarDays, ClipboardCheck,
  LayoutDashboard, LogOut, Menu, Settings, Star, Users, Wrench, X,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import NotificationBell from "@/components/system/NotificationBell";
import { SkipToContent } from "@/lib/a11y";

export interface PortalCompany {
  id: string; companyName: string; logoUrl?: string; status?: string;
  verificationStatus?: string;
  businessCategories?: string[];
}
export interface PortalMe {
  company: PortalCompany; myRole: string;
  stats?: Record<string, number>;
}

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; financeOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/company", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/company/jobs", label: "Jobs", icon: Briefcase },
  { to: "/company/team", label: "Team", icon: Users },
  { to: "/company/services", label: "Services", icon: Wrench },
  { to: "/company/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/company/quality", label: "Quality", icon: Star },
  { to: "/company/finance", label: "Finance", icon: BarChart3, financeOnly: true },
  { to: "/company/settings", label: "Settings", icon: Settings },
];

// Finance nav is hidden for roles the server would 403 anyway (spec §29:
// dispatchers/technicians must not see sensitive financial navigation).
const FINANCE_ROLES = ["owner", "finance", "admin", "manager"];

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[7]];

export default function CompanyPortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/overview") as PortalMe;
        setMe(res);
        if (res.company?.status === "suspended") setDenied("suspended");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        setDenied(msg.includes("not a member") || msg.includes("403") || msg.includes("Unauthorized") ? "forbidden" : "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = async () => {
    try { await apiClient.request("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    localStorage.removeItem("auth_token");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading company portal…</div>
      </div>
    );
  }

  if (denied || !me) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-3xl border bg-card p-8 text-center max-w-md">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="mt-3 font-semibold">Company portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {denied === "suspended"
              ? "This company account is currently suspended. Contact PataFundi support."
              : denied === "forbidden"
              ? "You are not a member of a company on PataFundi. Apply through the Partner Program or log in with your company account."
              : "Unable to load the company portal. Try again."}
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => navigate(0)} className="rounded-xl border px-4 py-2 text-sm">Retry</button>
            <NavLink to="/partner-program" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm">Partner with PataFundi</NavLink>
          </div>
        </div>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5 border-b">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Company Portal</p>
        <p className="mt-1 font-semibold tracking-tight truncate">{me.company.companyName}</p>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 capitalize">
          {me.myRole}
        </span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.filter(({ financeOnly }) => !financeOnly || FINANCE_ROLES.includes(String(me?.myRole || "")))
          .map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              isActive ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-4 space-y-1 border-t pt-3">
        <NavLink to="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted">
          <ClipboardCheck className="h-4 w-4" /> Customer app
        </NavLink>
        <button onClick={logout} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-64 border-r bg-card/50 flex-col fixed inset-y-0">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card border-r shadow-xl flex flex-col">
            <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-3 p-2 rounded-lg hover:bg-muted" aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 border-b bg-background/80 backdrop-blur h-14 flex items-center justify-between px-4">
          <button onClick={() => setMenuOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-semibold text-sm truncate">{me.company.companyName}</p>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={logout} className="p-2 -mr-2 rounded-lg hover:bg-muted" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

                <SkipToContent />
<main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 min-w-0">
          <Outlet context={me} />
        </main>

        {/* Mobile bottom navigation */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
