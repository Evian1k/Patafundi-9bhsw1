/**
 * Immutable session snapshot — set only at login/logout.
 * Job APIs must never update this state.
 */
const ROLE_KEY = 'auth_role';
const USER_ID_KEY = 'auth_user_id';

export type AuthRole = 'customer' | 'fundi' | 'fundi_pending' | 'admin';

export function setAuthSession(userId: string, role: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(USER_ID_KEY, userId);
  sessionStorage.setItem(ROLE_KEY, String(role || 'customer').toLowerCase());
}

export function clearAuthSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(USER_ID_KEY);
  sessionStorage.removeItem(ROLE_KEY);
}

export function getAuthRole(): AuthRole | null {
  if (typeof sessionStorage === 'undefined') return null;
  const role = sessionStorage.getItem(ROLE_KEY);
  if (!role) return null;
  if (role === 'customer' || role === 'fundi' || role === 'fundi_pending' || role === 'admin') {
    return role;
  }
  return null;
}

export function getAuthUserId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(USER_ID_KEY);
}

/** Prefer live API role over stale sessionStorage lock. */
export function resolveAuthRole(user?: Record<string, unknown> | null): AuthRole {
  if (user?.role) {
    const apiRole = String(user.role).toLowerCase();
    if (apiRole === 'fundi' || apiRole === 'fundi_pending' || apiRole === 'admin' || apiRole === 'customer') {
      return apiRole;
    }
  }
  const locked = getAuthRole();
  if (locked) return locked;
  return 'customer';
}

/** Lock role from /users/me; refresh when API role changed (e.g. after admin approval). */
export function bootstrapAuthSessionFromUser(user?: Record<string, unknown> | null): AuthRole | null {
  if (!user?.id) return null;
  const apiRole = String(user.role || 'customer');
  const locked = getAuthRole();
  if (!locked || locked !== apiRole) {
    setAuthSession(String(user.id), apiRole);
  }
  return resolveAuthRole(user);
}
