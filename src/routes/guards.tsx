import { Navigate } from "react-router-dom";

/** Fast client-side admin gate — AdminLayout does server-side verification. */
export function isAdmin(): boolean {
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
    return payload.role === "admin" || (Array.isArray(payload.roles) && payload.roles.includes("admin"));
  } catch {
    return false;
  }
}

export function ProtectedAdminRoute({ element }: { element: React.ReactNode }) {
  const token = localStorage.getItem("auth_token");
  if (!token || !isAdmin()) return <Navigate to="/admin/login" replace />;
  return <>{element}</>;
}
