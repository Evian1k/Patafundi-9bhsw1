import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { apiClient, colors } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator, AuthStackParamList } from './AuthNavigator';
import { PendingApprovalNavigator, PendingApprovalStackParamList } from './PendingApprovalNavigator';
import { MainNavigator, MainTabParamList } from './MainNavigator';

type RootParamList = AuthStackParamList & PendingApprovalStackParamList & MainTabParamList;

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
    <NavigationContainer>
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
