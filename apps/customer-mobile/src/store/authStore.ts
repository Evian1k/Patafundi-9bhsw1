import { create } from 'zustand';
import { apiClient } from '@patafundi/shared';
import type { User } from '@patafundi/shared';

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, phone: string, referralCode?: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.login(email, password);
      if (data.user && data.user.role === 'fundi') {
        await apiClient.logout();
        set({ loading: false, error: 'This account is a fundi. Please use the Fundi app.', isLoggedIn: false, user: null });
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

  register: async (email: string, password: string, fullName: string, phone: string, referralCode?: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.register(email, password, fullName, phone, referralCode);
      set({ loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      set({ loading: false, error: msg });
      throw e;
    }
  },

  verifyOtp: async (email: string, code: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.verifyOtp(email, code);
      if (data.user && data.user.role === 'fundi') {
        await apiClient.logout();
        set({ loading: false, error: 'This account is a fundi. Please use the Fundi app.', isLoggedIn: false, user: null });
        return;
      }
      set({ loading: false, user: data.user || null, isLoggedIn: !!data.token, error: null });
      apiClient.connectSocket();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      set({ loading: false, error: msg });
      throw e;
    }
  },

  resendOtp: async (email: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.resendOtp(email);
      set({ loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Resend failed';
      set({ loading: false, error: msg });
      throw e;
    }
  },

  forgotPassword: async (email: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.forgotPassword(email);
      set({ loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
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
      if (data.user && data.user.role === 'fundi') {
        await apiClient.logout();
        set({ user: null, isLoggedIn: false, error: 'This account is a fundi. Please use the Fundi app.' });
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
