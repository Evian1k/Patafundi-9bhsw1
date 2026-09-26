import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Alert,
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

const APP_STORE_URL = 'https://apps.apple.com/app/patafundi';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.patafundi.app';
const APP_VERSION = '1.0.0';

export function AppUpdateRequiredScreen({ route, navigation }: any): JSX.Element {
  const insets = useSafeAreaInsets();
  const mandatory: boolean = route?.params?.mandatory ?? true;
  const version: string = route?.params?.version ?? '';
  const message: string = route?.params?.message ?? '';
  const isOptional = !mandatory;

  const handleUpdate = async (): Promise<void> => {
    const tryStore = async (url: string): Promise<boolean> => {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return true;
        }
      } catch {
        // fall through
      }
      return false;
    };

    const opened = (await tryStore(APP_STORE_URL)) || (await tryStore(PLAY_STORE_URL));
    if (!opened) {
      Alert.alert('Cannot open store', 'Please update the app from your device\'s app store.');
    }
  };

  const handleLater = (): void => {
    if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  return (
    <LinearGradient
      colors={[gradients.primary.start, gradients.primary.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.logoWrap}>
        <View style={styles.logoCircle}>
          <Ionicons name="flash" size={48} color={colors.primaryForeground} />
        </View>
        <Text style={styles.appName}>PataFundi</Text>
        {version ? <Text style={styles.appVersion}>New version {version}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={[styles.iconWrap, isOptional ? styles.iconWrapOptional : styles.iconWrapMandatory]}>
          <Ionicons
            name={isOptional ? 'cloud-download' : 'alert-circle'}
            size={40}
            color={isOptional ? colors.accent : colors.warningForeground}
          />
        </View>
        <Text style={styles.title}>
          {isOptional ? 'Update Available' : 'Update Required'}
        </Text>
        <Text style={styles.subtitle}>
          {message
            ? message
            : isOptional
              ? 'A new version of PataFundi is ready to install. Get the latest features and improvements.'
              : 'This version of PataFundi is no longer supported. Please update to continue using the app.'}
        </Text>

        <TouchableOpacity onPress={handleUpdate} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.updateBtn}
          >
            <Ionicons name="download" size={18} color={colors.primaryForeground} />
            <Text style={styles.updateBtnText}>Update Now</Text>
          </LinearGradient>
        </TouchableOpacity>

        {isOptional ? (
          <TouchableOpacity onPress={handleLater} activeOpacity={0.7} style={styles.laterBtn}>
            <Text style={styles.laterBtnText}>Later</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.mandatoryNote}>
            You must update to continue. The app cannot be used until you install the latest version.
          </Text>
        )}
      </View>

      <Text style={styles.footerVersion}>Current installed: v{APP_VERSION}</Text>
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
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius['2xl'],
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.lg,
  },
  appName: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
  },
  appVersion: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
    opacity: 0.85,
    marginTop: 4,
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
    width: 88,
    height: 88,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconWrapMandatory: {
    backgroundColor: colors.warningLight,
  },
  iconWrapOptional: {
    backgroundColor: colors.accentLighter,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: borderRadius.lg,
  },
  updateBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primaryForeground,
  },
  laterBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  laterBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  mandatoryNote: {
    marginTop: spacing.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerVersion: {
    marginTop: spacing.xl,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    opacity: 0.7,
  },
});
