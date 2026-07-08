import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  shadows,
} from '@patafundi/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_PAGE_URL = 'https://patafundi-9bhsw1.vercel.app/status';
const SUPPORT_EMAIL_URL = 'mailto:support@patafundi.com?subject=PataFundi%20Maintenance';

export function MaintenanceModeScreen({ route, navigation }: any): JSX.Element {
  const insets = useSafeAreaInsets();
  const message: string = route?.params?.message ?? '';
  const estimatedCompletion: string = route?.params?.estimatedCompletion ?? '';
  const [retrying, setRetrying] = useState(false);

  const rotation = useRef<Animated.Value>(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [rotation]);

  const gearStyle = {
    transform: [
      {
        rotate: rotation.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };

  const openStatusPage = async (): Promise<void> => {
    try {
      const ok = await Linking.canOpenURL(STATUS_PAGE_URL);
      if (ok) {
        await Linking.openURL(STATUS_PAGE_URL);
        return;
      }
    } catch {
      // fall through to alert
    }
    Alert.alert('Status page', STATUS_PAGE_URL);
  };

  const openSupport = async (): Promise<void> => {
    try {
      const ok = await Linking.canOpenURL(SUPPORT_EMAIL_URL);
      if (ok) {
        await Linking.openURL(SUPPORT_EMAIL_URL);
        return;
      }
    } catch {
      // fall through
    }
    Alert.alert('Contact support', 'Email us at support@patafundi.com');
  };

  const handleRetry = useCallback(async (): Promise<void> => {
    setRetrying(true);
    try {
      const url = `${apiClient.getBaseUrl()}/api/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          if (navigation?.goBack) navigation.goBack();
          return;
        }
      } catch {
        clearTimeout(timeout);
      }
      Alert.alert('Still under maintenance', 'Please try again in a few minutes.');
    } finally {
      setRetrying(false);
    }
  }, [navigation]);

  return (
    <LinearGradient
      colors={[gradients.primary.start, gradients.primary.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.gearWrap, gearStyle]}>
          <Ionicons name="construct" size={56} color={colors.primaryForeground} />
        </Animated.View>
      </View>

      <Text style={styles.title}>We'll be right back</Text>
      <Text style={styles.subtitle}>
        PataFundi is undergoing scheduled maintenance to bring you a better experience.
      </Text>

      {message ? (
        <View style={styles.messageCard}>
          <Ionicons name="information-circle" size={18} color={colors.primary} />
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {estimatedCompletion ? (
        <View style={styles.etaCard}>
          <Ionicons name="time" size={18} color={colors.accent} />
          <Text style={styles.etaLabel}>Estimated completion</Text>
          <Text style={styles.etaValue}>{estimatedCompletion}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.retryBtn}
        onPress={handleRetry}
        disabled={retrying}
        activeOpacity={0.85}
      >
        {retrying ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <>
            <Ionicons name="refresh" size={18} color={colors.primaryForeground} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statusLink}
        onPress={openStatusPage}
        activeOpacity={0.7}
      >
        <Ionicons name="globe" size={16} color={colors.primaryForeground} />
        <Text style={styles.statusLinkText}>View Status Page</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.supportLink}
        onPress={openSupport}
        activeOpacity={0.7}
      >
        <Ionicons name="mail" size={16} color={colors.primaryForeground} />
        <Text style={styles.supportLinkText}>Contact Support</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Thank you for your patience.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  gearWrap: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    opacity: 0.92,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
    ...shadows.md,
  },
  messageText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.xl,
    flexWrap: 'wrap',
  },
  etaLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
    opacity: 0.85,
  },
  etaValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
  },
  retryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primary,
  },
  statusLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusLinkText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    textDecorationLine: 'underline',
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  supportLinkText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: spacing.xl,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    opacity: 0.7,
    textAlign: 'center',
  },
});
