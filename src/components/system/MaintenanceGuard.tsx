/**
 * MaintenanceGuard — wraps the app and checks if the platform is in
 * maintenance mode. If so:
 *   - Staff (super_admin, admin, support_agent, etc.) → continue to app
 *   - Customers and fundis → redirect to /maintenance
 *   - Logged out users on /auth → allowed (so staff can log in)
 *
 * The guard polls the backend every 60 seconds to detect maintenance
 * mode changes. When maintenance is turned off, users are automatically
 * redirected back to the app.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api";

const STAFF_ROLES = new Set([
  "super_admin", "admin", "support_agent", "fraud_analyst",
  "finance_team", "dispatch_team", "devops_engineer", "auditor",
]);

const PUBLIC_PATHS = ["/auth", "/staff/login", "/admin/login", "/maintenance", "/demo"];

export default function MaintenanceGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const me = await apiClient.getCurrentUser();
        const role = me?.user?.role || "";
        if (mounted) {
          setUserRole(role);
          setMaintenanceOn(false); // if we got a response, maintenance is off for this user
          setChecked(true);
        }
      } catch (err: any) {
        if (mounted) {
          if (err?.maintenanceMode === true) {
            // Maintenance mode is ON — check if we have a token to determine role
            // Staff bypass maintenance on the backend, so if we got 503 with
            // maintenanceMode: true, the user is NOT staff (or not logged in)
            setMaintenanceOn(true);
            setUserRole("");
          } else {
            // Other error (network, 401, etc.) — don't block the user
            setMaintenanceOn(false);
          }
          setChecked(true);
        }
      }
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Redirect logic
  useEffect(() => {
    if (!checked) return;

    const isPublicPath = PUBLIC_PATHS.some(p => location.pathname.startsWith(p));
    const isStaff = STAFF_ROLES.has(userRole);

    if (maintenanceOn && !isStaff && !isPublicPath) {
      // Non-staff user trying to access app during maintenance → redirect
      navigate("/maintenance", { replace: true });
    } else if (!maintenanceOn && location.pathname === "/maintenance") {
      // Maintenance is off — redirect back to dashboard
      navigate("/dashboard", { replace: true });
    }
  }, [maintenanceOn, userRole, checked, location.pathname, navigate]);

  return <>{children}</>;
}
