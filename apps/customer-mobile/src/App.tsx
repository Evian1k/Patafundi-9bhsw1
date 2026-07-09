import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { apiClient, colors } from '@patafundi/shared';
import { useAuthStore } from './store/authStore';
import { RootNavigator } from './navigation/RootNavigator';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { linking } from './linking';

const ONBOARDING_KEY = 'onboarding_complete';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function App(): JSX.Element {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hardFallback = setTimeout(() => {
      if (mounted) {
        setReady(true);
        SplashScreen.hideAsync().catch(() => undefined);
      }
    }, 6000);

    (async () => {
      try {
        await withTimeout(apiClient.ensureTokensLoaded(), 4000, undefined as any);
        await withTimeout(checkAuth(), 4000, undefined as any);
        await withTimeout(Location.requestForegroundPermissionsAsync(), 4000, { status: 'undetermined' } as any);
        try {
          const flag = await AsyncStorage.getItem(ONBOARDING_KEY);
          if (mounted && !flag) setNeedsOnboarding(true);
        } catch {
          // ignore storage errors — proceed without onboarding
        }
      } catch {
        // continue regardless of failures
      } finally {
        if (mounted) {
          setReady(true);
          SplashScreen.hideAsync().catch(() => undefined);
          clearTimeout(hardFallback);
        }
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(hardFallback);
    };
  }, [checkAuth]);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (needsOnboarding && !isLoggedIn) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <RootNavigator linking={linking} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
