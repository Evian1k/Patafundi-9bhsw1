import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { apiClient, colors } from '@patafundi/shared';
import { useAuthStore } from './store/authStore';
import { RootNavigator } from './navigation/RootNavigator';
import { linking } from './linking';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export default function App(): JSX.Element {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [ready, setReady] = useState(false);

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
        await withTimeout(apiClient.ensureTokensLoaded(), 4000);
        await withTimeout(checkAuth(), 4000);
        await withTimeout(Location.requestForegroundPermissionsAsync(), 4000);
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
