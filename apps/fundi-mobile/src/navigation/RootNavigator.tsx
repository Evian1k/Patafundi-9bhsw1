import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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

type AppMode = 'auth' | 'checking' | 'pending' | 'main';

export function RootNavigator(): JSX.Element {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [mode, setMode] = useState<AppMode>('checking');

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      if (!isLoggedIn) {
        if (!cancelled) setMode('auth');
        return;
      }
      try {
        const data = await apiClient.getApprovalStatus();
        if (cancelled) return;
        if (data && data.status === 'approved') {
          setMode('main');
        } else {
          setMode('pending');
        }
      } catch {
        if (!cancelled) setMode('pending');
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (mode === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
});

export type { RootParamList };
