import { Navigate } from "react-router-dom";

const STAFF_ROLES = [
  "admin", "super_admin", "ops_manager", "support_agent", "fraud_analyst",
  "finance_team", "dispatch_team", "devops_engineer", "auditor",
];

const PUBLIC_ROLES = ["customer", "fundi", "fundi_pending"];

/** Fast client-side staff gate — backend does server-side verification via RBAC. */
export function isStaff(): boolean {
  try {
    const token = localStorage.getItem("auth_token");
    if (!token) return false;
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
    const role = payload.role;
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    return STAFF_ROLES.includes(role) || roles.some((r: string) => STAFF_ROLES.includes(r));
  } catch {
    return false;
  }
}

/** Check if current user is a public user (customer or fundi) */
export function isPublicUser(): boolean {
  try {
    const token = localStorage.getItem("auth_token");
    if (!token) return false;
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
    return PUBLIC_ROLES.includes(payload.role);
  } catch {
    return false;
  }
}

/** Get current user's role from JWT (client-side, for routing only) */
export function getCurrentRole(): string | null {
  try {
    const token = localStorage.getItem("auth_token");
    if (!token) return null;
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
    return payload.role || null;
  } catch {
    return null;
  }
}

/** Backward-compat alias — accepts super_admin + all staff roles. */
export function isAdmin(): boolean {
  return isStaff();
}

/**
 * ProtectedAdminRoute — only staff can access /admin/* routes.
 * Customers and fundis are redirected to their own dashboards.
 */
export function ProtectedAdminRoute({ element }: { element: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/admin/login" replace />;
  if (!isStaff()) {
    // Customer or fundi trying to access admin → redirect to their dashboard
    return <Navigate to="/dashboard" replace />;
  }
  return <>{element}</>;
}

/**
 * ProtectedCustomerRoute — only customers and fundis can access customer pages.
 * Staff are redirected to the staff portal.
 */
export function ProtectedCustomerRoute({ element }: { element: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/auth" replace />;
  if (isStaff()) {
    // Staff trying to access customer pages → redirect to staff portal
    return <Navigate to="/staff" replace />;
  }
  return <>{element}</>;
}

/**
 * ProtectedFundiRoute — only fundis (approved) can access fundi working pages.
 * Customers are redirected to their dashboard.
 * Staff are redirected to staff portal.
 * Pending fundis are redirected to pending page.
 */
export function ProtectedFundiRoute({ element }: { element: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/auth" replace />;
  const role = getCurrentRole();
  if (role && STAFF_ROLES.includes(role)) return <Navigate to="/staff" replace />;
  if (role === "customer") return <Navigate to="/dashboard" replace />;
  if (role === "fundi_pending") return <Navigate to="/fundi/pending" replace />;
  return <>{element}</>;
}
