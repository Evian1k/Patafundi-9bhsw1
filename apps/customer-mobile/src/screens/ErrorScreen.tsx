import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  shadows,
} from '@patafundi/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ErrorType = '404' | '500' | 'timeout' | 'permission' | 'generic';

interface ErrorConfig {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  defaultBody: string;
  gradient: keyof typeof gradients;
  tint: string;
}

const ERROR_CONFIG: Record<ErrorType, ErrorConfig> = {
  '404': {
    icon: 'compass',
    title: 'Page Not Found',
    defaultBody: "We couldn't find the page you were looking for. It may have moved or no longer exists.",
    gradient: 'accent',
    tint: colors.accent,
  },
  '500': {
    icon: 'server',
    title: 'Server Error',
    defaultBody: 'Our servers had a hiccup. We\'ve been notified and are working on it.',
    gradient: 'danger',
    tint: colors.error,
  },
  timeout: {
    icon: 'hourglass',
    title: 'Request Timed Out',
    defaultBody: 'The request took too long to complete. Check your connection and try again.',
    gradient: 'primary',
    tint: colors.primary,
  },
  permission: {
    icon: 'lock-closed',
    title: 'Permission Denied',
    defaultBody: "You don't have permission to view this. If you believe this is a mistake, contact support.",
    gradient: 'danger',
    tint: colors.warning,
  },
  generic: {
    icon: 'warning',
    title: 'Something Went Wrong',
    defaultBody: 'An unexpected error occurred. Please try again, or contact support if it persists.',
    gradient: 'danger',
    tint: colors.warning,
  },
};

export function ErrorScreen({ route, navigation }: any): JSX.Element {
  const insets = useSafeAreaInsets();
  const type: ErrorType = (route?.params?.type as ErrorType) ?? 'generic';
  const message: string = route?.params?.message ?? '';
  const onRetry: (() => void) | undefined = route?.params?.onRetry;

  const config = ERROR_CONFIG[type] ?? ERROR_CONFIG.generic;
  const gradient = gradients[config.gradient];

  const handleRetry = (): void => {
    if (typeof onRetry === 'function') {
      onRetry();
      return;
    }
    if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  const handleHome = (): void => {
    if (navigation) {
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate('HomeTab');
        return;
      }
      if (navigation.navigate) {
        navigation.navigate('Home');
      }
    }
  };

  const handleSupport = (): void => {
    if (navigation?.navigate) {
      navigation.navigate('Support');
    }
  };

  return (
    <LinearGradient
      colors={[gradient.start, gradient.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={[gradient.start, gradient.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name={config.icon} size={44} color={colors.primaryForeground} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.body}>
          {message || config.defaultBody}
        </Text>

        <TouchableOpacity onPress={handleRetry} activeOpacity={0.85} style={styles.primaryBtn}>
          <LinearGradient
            colors={[gradient.start, gradient.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtnGradient}
          >
            <Ionicons name="refresh" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>Retry</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={handleHome} activeOpacity={0.7} style={styles.secondaryBtn}>
            <Ionicons name="home" size={16} color={config.tint} />
            <Text style={[styles.secondaryBtnText, { color: config.tint }]}>Go Home</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSupport} activeOpacity={0.7} style={styles.secondaryBtn}>
            <Ionicons name="headset" size={16} color={config.tint} />
            <Text style={[styles.secondaryBtnText, { color: config.tint }]}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footerCode}>Error code: {type}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.xl,
  },
  iconWrap: {
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: borderRadius.lg,
  },
  primaryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primaryForeground,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  footerCode: {
    marginTop: spacing.xl,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    opacity: 0.7,
  },
});
