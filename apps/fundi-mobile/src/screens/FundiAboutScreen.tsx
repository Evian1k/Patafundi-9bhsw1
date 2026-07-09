import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Share,
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
} from '@patafundi/shared';

const APP_VERSION = '1.0.0';
const WEBSITE_URL = 'https://patafundi-9bhsw1.vercel.app';
const APP_STORE_URL = 'https://apps.apple.com/app/patafundi-fundi';

interface SocialLink {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  url: string;
}

const SOCIALS: SocialLink[] = [
  { icon: 'logo-facebook', color: '#1877F2', url: 'https://facebook.com/patafundi' },
  { icon: 'logo-twitter', color: '#1DA1F2', url: 'https://twitter.com/patafundi' },
  { icon: 'logo-instagram', color: '#E4405F', url: 'https://instagram.com/patafundi' },
  { icon: 'logo-linkedin', color: '#0A66C2', url: 'https://linkedin.com/company/patafundi' },
];

interface LinkItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  action: () => void;
}

export function FundiAboutScreen({ navigation }: any): JSX.Element {
  const openUrl = async (url: string): Promise<void> => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open', `Unable to open: ${url}`);
      }
    } catch {
      Alert.alert('Error', 'Failed to open link.');
    }
  };

  const handleShare = async (): Promise<void> => {
    try {
      await Share.share({
        message: `Earn money on your schedule with PataFundi Fundi. Sign up at ${WEBSITE_URL}`,
        title: 'PataFundi Fundi',
      });
    } catch {
      // ignore
    }
  };

  const handleContactSupport = async (): Promise<void> => {
    const email = 'mailto:support@patafundi.com?subject=Fundi%20App%20Support';
    try {
      const supported = await Linking.canOpenURL(email);
      if (supported) {
        await Linking.openURL(email);
      } else {
        Alert.alert('Contact support', 'Email us at support@patafundi.com');
      }
    } catch {
      Alert.alert('Error', 'Failed to open email client.');
    }
  };

  const links: LinkItem[] = [
    { icon: 'star-outline', label: 'Rate on App Store', action: () => void openUrl(APP_STORE_URL) },
    { icon: 'share-social-outline', label: 'Share App', action: handleShare },
    { icon: 'globe-outline', label: 'Visit Website', action: () => void openUrl(WEBSITE_URL) },
    { icon: 'headset-outline', label: 'Contact Support', action: () => void handleContactSupport() },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' }}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'About'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <LinearGradient
        colors={[gradients.primary.start, gradients.primary.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logo}
      >
        <Ionicons name="build" size={48} color={colors.primaryForeground} />
      </LinearGradient>

      <Text style={styles.appName}>PataFundi Fundi</Text>
      <Text style={styles.version}>Version {APP_VERSION}</Text>
      <Text style={styles.tagline}>Earn money on your schedule</Text>

      <View style={styles.linksCard}>
        {links.map((link, idx) => (
          <TouchableOpacity
            key={link.label}
            style={[
              styles.linkRow,
              idx < links.length - 1 ? styles.linkRowBorder : null,
            ]}
            onPress={link.action}
            activeOpacity={0.7}
          >
            <View style={styles.linkIconWrap}>
              <Ionicons name={link.icon} size={20} color={colors.primary} />
            </View>
            <Text style={styles.linkLabel}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Follow us</Text>
      <View style={styles.socialRow}>
        {SOCIALS.map((social) => (
          <TouchableOpacity
            key={social.url}
            style={[styles.socialBtn, { borderColor: social.color + '40' }]}
            onPress={() => void openUrl(social.url)}
            activeOpacity={0.7}
          >
            <Ionicons name={social.icon} size={22} color={social.color} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.copyright}>© 2026 PataFundi. All rights reserved.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: borderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  appName: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.text,
  },
  version: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  linksCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  linkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  linkIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.xl,
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
  },
  copyright: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
