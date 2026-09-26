import { create } from 'zustand';
import { createBaseAuthState } from '@patafundi/shared';
import type { AuthGuard, BaseAuthState } from '@patafundi/shared';

type AuthState = BaseAuthState;

// A fundi goes through two phases:
//   1. fundi_pending — just registered, waiting for email verification + admin approval
//   2. fundi — admin has approved their account
// Both roles should be accepted in the fundi app. The RootNavigator will
// route fundi_pending users to PendingApprovalScreen.
const FUNDI_ROLES = ['fundi', 'fundi_pending'];

const guard: AuthGuard = {
  isAllowedRole: (role) => FUNDI_ROLES.includes(role),
  wrongAppError: 'This app is for fundis only. Please use the customer app.',
};

export const useAuthStore = create<AuthState>((set, get) => createBaseAuthState(set, get, guard));
