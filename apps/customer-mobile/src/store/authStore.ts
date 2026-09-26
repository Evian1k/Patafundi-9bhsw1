import { create } from 'zustand';
import { adoptSession, apiClient, createBaseAuthState, runAuthAction } from '@patafundi/shared';
import type { AuthGuard, BaseAuthState } from '@patafundi/shared';

interface AuthState extends BaseAuthState {
  register: (email: string, password: string, fullName: string, phone: string, referralCode?: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
}

const guard: AuthGuard = {
  isAllowedRole: (role) => role !== 'fundi',
  wrongAppError: 'This account is a fundi. Please use the Fundi app.',
};

export const useAuthStore = create<AuthState>((set, get) => ({
  ...createBaseAuthState(set, get, guard),

  register: async (email: string, password: string, fullName: string, phone: string, referralCode?: string) => {
    await runAuthAction(set, 'Registration failed', () =>
      apiClient.register(email, password, fullName, phone, referralCode),
    );
  },

  verifyOtp: async (email: string, code: string) => {
    const data = await runAuthAction(set, 'Verification failed', () => apiClient.verifyOtp(email, code));
    await adoptSession(set, data, guard);
  },

  resendOtp: async (email: string) => {
    await runAuthAction(set, 'Resend failed', () => apiClient.resendOtp(email));
  },

  forgotPassword: async (email: string) => {
    await runAuthAction(set, 'Request failed', () => apiClient.forgotPassword(email));
  },
}));
