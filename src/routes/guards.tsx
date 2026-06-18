import { Navigate } from "react-router-dom";

const STAFF_ROLES = [
  "admin", "super_admin", "support_agent", "fraud_analyst",
  "finance_team", "dispatch_team", "devops_engineer", "auditor",
];

/** Fast client-side staff gate — AdminLayout does server-side verification. */
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
    // Check both 'role' (single) and 'roles' (array) for backward compat.
    const role = payload.role;
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    return STAFF_ROLES.includes(role) || roles.some((r: string) => STAFF_ROLES.includes(r));
  } catch {
    return false;
  }
}

/** Backward-compat alias — accepts super_admin + all staff roles. */
export function isAdmin(): boolean {
  return isStaff();
}

export function ProtectedAdminRoute({ element }: { element: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token || !isStaff()) return <Navigate to="/admin/login" replace />;
  return <>{element}</>;
}
