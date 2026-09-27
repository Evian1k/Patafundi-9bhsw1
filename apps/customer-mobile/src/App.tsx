import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@patafundi/shared';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './navigation/RootNavigator';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { useAuthStore } from './store/authStore';
import { usePushNotifications } from './hooks/usePushNotifications';
import { linking } from './linking';

const ONBOARDING_KEY = 'onboarding_complete';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  usePushNotifications();
  // First-run onboarding (spec §5): explain the value and permissions before
  // the main app. Shown exactly once, persisted in AsyncStorage.
  const [onboardingState, setOnboardingState] = useState<'checking' | 'show' | 'done'>('checking');

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (alive) setOnboardingState(done ? 'done' : 'show');
      } catch {
        if (alive) setOnboardingState('show');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (onboardingState === 'checking') {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (onboardingState === 'show') {
    return (
      <>
        <StatusBar style="auto" />
        <OnboardingScreen onComplete={() => setOnboardingState('done')} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <RootNavigator linking={linking} />
    </>
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
