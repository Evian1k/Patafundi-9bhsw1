/**
 * Mobile Bottom Navigation — Uber/Bolt style
 * Shows on mobile only. Fixed at bottom with safe area padding.
 * Tabs: Home, Jobs, Wallet, Profile
 */
import { Link, useLocation } from "react-router-dom";
import { Home, Briefcase, Wallet, User } from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Jobs", href: "/create-job", icon: Briefcase },
  { label: "Wallet", href: "/settings", icon: Wallet },
  { label: "Profile", href: "/settings", icon: User },
];

export default function MobileBottomNav() {
  const location = useLocation();

  // Only show on customer/fundi pages (not staff, not auth, not public pages)
  const hideOnRoutes = ["/auth", "/staff", "/admin", "/register", "/maintenance", "/status"];
  const shouldHide = hideOnRoutes.some(r => location.pathname.startsWith(r));
  if (shouldHide) return null;

  // Only show on mobile (CSS handles the breakpoint)
  return (
    <nav className="bottom-nav md:hidden bg-white border-t border-slate-100 shadow-lg">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                active ? "text-primary" : "text-slate-400"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
