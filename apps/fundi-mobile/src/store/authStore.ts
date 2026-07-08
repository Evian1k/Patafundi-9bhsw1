import { create } from 'zustand';
import { apiClient } from '@patafundi/shared';
import type { User } from '@patafundi/shared';

interface AuthState {
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

const FUNDI_ONLY_ERROR = 'This app is for fundis only. Please use the customer app.';

// A fundi goes through two phases:
//   1. fundi_pending — just registered, waiting for email verification + admin approval
//   2. fundi — admin has approved their account
// Both roles should be accepted in the fundi app. The RootNavigator will
// route fundi_pending users to PendingApprovalScreen.
const FUNDI_ROLES = ['fundi', 'fundi_pending'];

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.login(email, password);
      if (data.user && !FUNDI_ROLES.includes(data.user.role)) {
        await apiClient.logout();
        set({ loading: false, error: FUNDI_ONLY_ERROR, isLoggedIn: false, user: null });
        return;
      }
      set({ loading: false, user: data.user || null, isLoggedIn: !!data.token, error: null });
      apiClient.connectSocket();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      set({ loading: false, error: msg });
      throw e;
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await apiClient.logout();
    } catch {
      // ignore
    } finally {
      set({ user: null, isLoggedIn: false, loading: false, error: null });
    }
  },

  fetchUser: async () => {
    try {
      const data = await apiClient.getCurrentUser();
      if (data.user && !FUNDI_ROLES.includes(data.user.role)) {
        await apiClient.logout();
        set({ user: null, isLoggedIn: false, error: FUNDI_ONLY_ERROR });
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
}));
