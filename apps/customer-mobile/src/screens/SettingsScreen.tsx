import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

const APP_VERSION = '1.0.0';

interface LegalLink {
  label: string;
  slug: string;
}

const LEGAL_LINKS: LegalLink[] = [
  { label: 'Terms of Service', slug: 'terms-of-service' },
  { label: 'Privacy Policy', slug: 'privacy-policy' },
  { label: 'Cookie Policy', slug: 'cookie-policy' },
  { label: 'Refund Policy', slug: 'refund-policy' },
  { label: 'Safety Guidelines', slug: 'safety-guidelines' },
  { label: 'Community Guidelines', slug: 'community-guidelines' },
];

export function SettingsScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleDeleteAccount = (): void => {
    Alert.alert(
      'Delete account',
      'This action is permanent. All your data will be removed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteAccount();
              await logout();
              Alert.alert('Account deleted', 'Your account has been removed.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to delete account';
              Alert.alert('Failed', msg);
            }
          },
        },
      ],
    );
  };

  const handleSignOut = (): void => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Settings'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.screenTitle}>Settings</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App version</Text>
          <Text style={styles.rowValue}>v{APP_VERSION}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Backend URL</Text>
          <Text style={[styles.rowValue, { maxWidth: 200 }]} numberOfLines={1}>
            {apiClient.getBaseUrl()}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Logged in as</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? '-'}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('EditProfile')}
      >
        <View style={styles.menuLeft}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
          <Text style={styles.menuLabel}>Edit Profile</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Updates</Text>
      <View style={styles.legalCard}>
        <TouchableOpacity
          style={[styles.legalRow, styles.legalRowBorder]}
          onPress={() => navigation.navigate('ReleaseNotes')}
          activeOpacity={0.7}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="newspaper-outline" size={20} color={colors.primary} />
            <Text style={styles.menuLabel}>Release Notes</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => navigation.navigate('AppUpdateRequired', { mandatory: false, version: '', message: '' })}
          activeOpacity={0.7}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
            <Text style={styles.menuLabel}>App Update Check</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Legal</Text>
      <View style={styles.legalCard}>
        {LEGAL_LINKS.map((link, idx) => (
          <TouchableOpacity
            key={link.slug}
            style={[
              styles.legalRow,
              idx < LEGAL_LINKS.length - 1 ? styles.legalRowBorder : null,
            ]}
            onPress={() => navigation.navigate('LegalPage', { slug: link.slug, title: link.label })}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>{link.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.outlineBtn, { borderColor: colors.error }]}
        onPress={handleDeleteAccount}
      >
        <Text style={[styles.outlineBtnText, { color: colors.error }]}>Delete Account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.outlineBtn, { borderColor: colors.error }]}
        onPress={handleSignOut}
      >
        <Text style={[styles.outlineBtnText, { color: colors.error }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
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
  screenTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  rowValue: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  legalCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  legalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  outlineBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: spacing.sm,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
  },
});
