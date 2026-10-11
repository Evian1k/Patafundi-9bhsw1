import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { apiClient, colors } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator, AuthStackParamList } from './AuthNavigator';
import { PendingApprovalNavigator, PendingApprovalStackParamList } from './PendingApprovalNavigator';
import { MainNavigator, MainTabParamList } from './MainNavigator';

type RootParamList = AuthStackParamList & PendingApprovalStackParamList & MainTabParamList;

// Deep links (spec §48): patafundi-fundi:// scheme plus https universal links
// to the web origin. Mirrors the customer app's linking config.
const linking: LinkingOptions<RootParamList> = {
  prefixes: ['patafundi-fundi://', 'https://patafundi-9bhsw1.vercel.app'],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      ForgotPassword: 'forgot-password',
      DashboardTab: {
        screens: {
          Dashboard: 'dashboard',
          JobDetail: 'jobs/:jobId',
          JobChat: 'jobs/:jobId/chat',
        },
      },
      JobsTab: {
        screens: {
          Jobs: 'jobs',
          JobDetail: 'jobs/:jobId',
        },
      },
      WalletTab: {
        screens: {
          Wallet: 'wallet',
          RequestPayout: 'wallet/payout',
        },
      },
      ProfileTab: {
        screens: {
          Profile: 'profile',
          Notifications: 'notifications',
          Disputes: 'disputes',
          CreateDispute: 'jobs/:jobId/dispute',
          Support: 'support',
          Reviews: 'reviews',
          Earnings: 'earnings',
          Verification: 'verification',
          Settings: 'settings',
        },
      },
    },
  },
};

type AppMode = 'auth' | 'checking' | 'pending' | 'main' | 'unavailable';

export function RootNavigator(): JSX.Element {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mode, setMode] = useState<AppMode>('checking');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      if (!isLoggedIn) {
        if (!cancelled) setMode('auth');
        return;
      }
      setMode('checking');
      try {
        const data = await apiClient.getApprovalStatus();
        if (cancelled) return;
        if (data && data.status === 'approved') {
          setMode('main');
        } else {
          setMode('pending');
        }
      } catch (error) {
        if (cancelled) return;
        const apiError = error as { code?: string; status?: number };
        if (apiError.code === 'SESSION_EXPIRED' || apiError.status === 401) {
          await logout();
          if (!cancelled) setMode('auth');
          return;
        }
        setMode('unavailable');
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, retryCount, user, logout]);

  if (mode === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (mode === 'unavailable') {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="header" style={styles.errorTitle}>Verification status unavailable</Text>
        <Text style={styles.errorMessage}>
          We could not reach PataFundi to check your application. No approval decision has been confirmed.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry verification status check"
          onPress={() => setRetryCount((value) => value + 1)}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {mode === 'auth' ? (
        <AuthNavigator />
      ) : mode === 'pending' ? (
        <PendingApprovalNavigator />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 24,
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    marginHorizontal: 28,
  },
  retryButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
});

export type { RootParamList };
