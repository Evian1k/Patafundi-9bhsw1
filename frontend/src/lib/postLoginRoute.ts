/**
 * Shared post-login routing — the SINGLE source of truth for "where does
 * this user land after authenticating?".
 *
 * Used by:
 *   - Auth.tsx           (manual login / signup / OTP)
 *   - DemoPage.tsx       (Quick Login buttons)
 *   - Dashboard.tsx      (stale-session landing correction)
 *
 * Role → destination:
 *   super_admin / admin      → /admin/dashboard   (executive command center)
 *   other staff roles        → /staff             (role-aware staff console —
 *                             /admin/dashboard-stats is permission-gated and
 *                             returns 403 for these roles)
 *   fundi                    → /fundi
 *   fundi_pending            → /fundi/pending (or /register/fundi when no profile)
 *   company_admin            → /company           (company portal)
 *   company member (dispatch/technician — users.role is 'customer') →
 *       detected via /company/portal/overview → /technician or /company
 *   everyone else            → /dashboard         (customer app)
 */
import { apiClient } from "@/lib/api";
import { bootstrapAuthSessionFromUser, resolveAuthRole } from "@/lib/authSession";

type MinimalUser = Record<string, unknown> | null | undefined;

/** Staff roles with their own console at /staff (permission-gated nav). */
const STAFF_CONSOLE_ROLES = new Set([
  "support_agent",
  "fraud_analyst",
  "finance_team",
  "dispatch_team",
  "devops_engineer",
  "auditor",
]);

export async function resolvePostLoginPath(
  user: MinimalUser,
  next?: string | null,
): Promise<string> {
  // Hygiene: only accept same-origin in-app paths from the ?next= param.
  // Blocks protocol-relative URLs (//evil.tld) and absolute origins.
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (!user) return safeNext || "/dashboard";
  bootstrapAuthSessionFromUser(user);

  const apiRole = String(user.role || "").toLowerCase();

  // Staff console roles first (resolveAuthRole doesn't bucket these).
  if (STAFF_CONSOLE_ROLES.has(apiRole)) return safeNext || "/staff";

  const role = resolveAuthRole(user);
  if (role === "admin") return safeNext || "/admin/dashboard";
  if (role === "fundi") return safeNext || "/fundi";
  if (role === "fundi_pending") {
    try {
      const s = (await apiClient.getFundiApprovalStatus()) as {
        fundi?: Record<string, unknown>;
      };
      return s?.fundi ? "/fundi/pending" : "/register/fundi";
    } catch {
      return "/register/fundi";
    }
  }

  // Company ecosystem routing (takeover): company admins → portal;
  // dispatchers/technicians detect membership server-side. Uses the dedicated
  // membership probe (200 for everyone) — the portal overview itself is
  // member-gated and would log a 403 for regular customers.
  if (String(user.role || "").toLowerCase() === "company_admin") {
    return safeNext || "/company";
  }
  // An explicit customer-app destination (mid-booking login) always wins over
  // membership probing — the user was booking, not opening a work console.
  if (next && (next.startsWith("/create-job") || next.startsWith("/companies"))) {
    return next;
  }
  try {
    const membership = (await apiClient.request("/company/my-membership")) as {
      isMember?: boolean;
      myRole?: string | null;
    };
    if (membership?.isMember && membership.myRole === "technician") return safeNext || "/technician";
    if (membership?.isMember) return safeNext || "/company";
  } catch {
    // not a company member — fall through to the customer app
  }

  return safeNext || "/dashboard";
}
