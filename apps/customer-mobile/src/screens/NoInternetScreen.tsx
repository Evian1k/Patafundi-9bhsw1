import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  shadows,
} from '@patafundi/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RETRY_INTERVAL_SECONDS = 10;

export function NoInternetScreen({ navigation }: any): JSX.Element {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(RETRY_INTERVAL_SECONDS);

  const fadeAnim = useRef<Animated.Value>(new Animated.Value(1)).current;

  const tryReconnect = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const url = `${apiClient.getBaseUrl()}/api/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) return true;
      } catch {
        clearTimeout(timeout);
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const handleRetry = useCallback(async (): Promise<void> => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.3, duration: 200, useNativeDriver: true, easing: Easing.ease }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.ease }),
    ]).start();
    const ok = await tryReconnect();
    if (ok && navigation?.goBack) {
      navigation.goBack();
    } else {
      setCountdown(RETRY_INTERVAL_SECONDS);
    }
  }, [tryReconnect, navigation, fadeAnim]);

  // Auto-retry countdown
  useEffect(() => {
    if (countdown <= 0) {
      void handleRetry();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, handleRetry]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="wifi" size={56} color={colors.textTertiary} />
          <View style={styles.iconStrike} />
        </View>

        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.subtitle}>
          Check your connection and try again. We'll retry automatically every {RETRY_INTERVAL_SECONDS} seconds.
        </Text>

        <TouchableOpacity
          style={styles.retryBtn}
          onPress={handleRetry}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color={colors.primaryForeground} />
              <Text style={styles.retryBtnText}>Retry Now</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.countdownCard}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.countdownText}>
            Auto-retry in {countdown}s
          </Text>
        </View>

        <View style={styles.offlineCard}>
          <View style={styles.offlineHeader}>
            <Ionicons name="cloud-offline" size={18} color={colors.accent} />
            <Text style={styles.offlineTitle}>Offline Mode</Text>
          </View>
          <Text style={styles.offlineText}>
            You can still view cached information such as your job history, wallet balance, and saved places from the relevant tabs.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
    ...shadows.sm,
  },
  iconStrike: {
    position: 'absolute',
    width: 80,
    height: 3,
    backgroundColor: colors.textTertiary,
    transform: [{ rotate: '-45deg' }],
    borderRadius: borderRadius.pill,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primaryForeground,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  countdownText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  offlineCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  offlineTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  offlineText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
