import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  type FundiDashboard,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MENU: MenuItem[] = [
  { label: 'Edit Profile', icon: 'create-outline', route: 'EditProfile' },
  { label: 'Portfolio', icon: 'images-outline', route: 'Portfolio' },
  { label: 'Availability', icon: 'calendar-outline', route: 'Availability' },
  { label: 'Reviews', icon: 'star-outline', route: 'Reviews' },
  { label: 'Earnings', icon: 'bar-chart-outline', route: 'Earnings' },
  { label: 'Verification', icon: 'shield-checkmark-outline', route: 'Verification' },
  { label: 'Trust & Safety', icon: 'shield-checkmark-outline', route: 'FundiTrustCenter' },
  { label: 'Help Center', icon: 'help-circle-outline', route: 'HelpCenter' },
  { label: 'About', icon: 'information-circle-outline', route: 'About' },
  { label: 'Settings', icon: 'settings-outline', route: 'Settings' },
];

export function ProfileScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [dashboard, setDashboard] = useState<FundiDashboard | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    try {
      const results = await Promise.allSettled([
        apiClient.getFundiDashboard(),
        apiClient.getVerificationStatus(),
        apiClient.getFundiProfile(),
      ]);
      if (results[0].status === 'fulfilled') setDashboard(results[0].value);
      if (results[1].status === 'fulfilled') {
        const status = (results[1].value as { status?: string; level?: string }).status ?? '';
        setVerified(status === 'verified' || status === 'approved');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const initial = (user?.fullName?.trim()?.[0] ?? 'F').toUpperCase();

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
      <View style={styles.header}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user?.fullName ?? 'Fundi'}</Text>
          {verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color={colors.success} />
            </View>
          ) : null}
        </View>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
        {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{(dashboard?.rating ?? 0).toFixed(1)}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{dashboard?.completedJobs ?? 0}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{Math.round((dashboard?.acceptanceRate ?? 0))}%</Text>
          <Text style={styles.statLabel}>Acceptance</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : null}

      <View style={styles.menuWrap}>
        {MENU.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={styles.menuLeft}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.error }]} onPress={handleSignOut}>
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
  header: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.success + '1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  email: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 2,
  },
  phone: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  menuWrap: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
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
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
  },
});
