import apiClient from './apiClient';
import type { AuthResponse, User } from './types';

/**
 * Auth state and behaviour shared by the customer and fundi apps. Each app
 * wraps this in its own zustand store and adds the flows it needs (the
 * customer app also handles registration, OTP and password reset).
 */
export interface BaseAuthState {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export interface AuthGuard {
  /** A session whose role is not accepted here is signed out. */
  isAllowedRole: (role: string) => boolean;
  /** Error shown when a session belongs to the other app. */
  wrongAppError: string;
}

type AuthSet = (partial: Partial<BaseAuthState>) => void;
type AuthGet = () => BaseAuthState;

function isAllowed(user: User | undefined, guard: AuthGuard): boolean {
  return !user || guard.isAllowedRole(user.role);
}

/**
 * Runs an auth request, funnelling failures into `error` state and rethrowing
 * so callers can react (e.g. keep the user on the form).
 */
export async function runAuthAction<T>(
  set: AuthSet,
  fallbackError: string,
  action: () => Promise<T>,
): Promise<T> {
  set({ loading: true, error: null });
  try {
    const result = await action();
    set({ loading: false, error: null });
    return result;
  } catch (e) {
    set({ loading: false, error: e instanceof Error ? e.message : fallbackError });
    throw e;
  }
}

/**
 * Applies the result of a login/OTP verification: rejects sessions belonging to
 * the other app, otherwise stores the user and opens the realtime socket.
 */
export async function adoptSession(
  set: AuthSet,
  data: AuthResponse,
  guard: AuthGuard,
): Promise<void> {
  if (!isAllowed(data.user, guard)) {
    await apiClient.logout();
    set({ loading: false, error: guard.wrongAppError, isLoggedIn: false, user: null });
    return;
  }
  set({ loading: false, user: data.user || null, isLoggedIn: !!data.token, error: null });
  apiClient.connectSocket();
}

export function createBaseAuthState(set: AuthSet, get: AuthGet, guard: AuthGuard): BaseAuthState {
  return {
    user: null,
    isLoggedIn: false,
    loading: false,
    error: null,

    login: async (email: string, password: string) => {
      const data = await runAuthAction(set, 'Login failed', () => apiClient.login(email, password));
      await adoptSession(set, data, guard);
    },

    logout: async () => {
      set({ loading: true });
      try {
        await apiClient.logout();
      } catch {
        // best effort — the local session is cleared either way
      } finally {
        set({ user: null, isLoggedIn: false, loading: false, error: null });
      }
    },

    fetchUser: async () => {
      try {
        const data = await apiClient.getCurrentUser();
        if (!isAllowed(data.user, guard)) {
          await apiClient.logout();
          set({ user: null, isLoggedIn: false, error: guard.wrongAppError });
          return;
        }
        set({ user: data.user, isLoggedIn: true });
      } catch {
        set({ user: null, isLoggedIn: false });
      }
    },

    checkAuth: async () => {
      set({ loading: true });
      try {
        await apiClient.ensureTokensLoaded();
        if (apiClient.isLoggedIn()) {
          await get().fetchUser();
          if (apiClient.isLoggedIn()) {
            apiClient.connectSocket();
          }
        } else {
          set({ user: null, isLoggedIn: false });
        }
      } catch {
        set({ user: null, isLoggedIn: false });
      } finally {
        set({ loading: false });
      }
    },

    clearError: () => set({ error: null }),
  };
}
