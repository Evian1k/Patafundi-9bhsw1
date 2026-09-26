import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
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
  type Job,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';
import { useFundiLocation } from '../hooks/useFundiLocation';

interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tab: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Wallet', icon: 'wallet-outline', tab: 'WalletTab' },
  { label: 'My Jobs', icon: 'briefcase-outline', tab: 'JobsTab' },
  { label: 'Profile', icon: 'person-outline', tab: 'ProfileTab' },
];

export function DashboardScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const [dashboard, setDashboard] = useState<FundiDashboard | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const results = await Promise.allSettled([
        apiClient.getFundiDashboard(),
        apiClient.getActiveJob(),
        apiClient.getFundiStatus(),
      ]);
      if (results[0].status === 'fulfilled') setDashboard(results[0].value);
      if (results[1].status === 'fulfilled') setActiveJob(results[1].value.job ?? null);
      if (results[2].status === 'fulfilled') setOnline(!!results[2].value.online);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  useFundiLocation({ enabled: online, jobId: activeJob?.id });

  const handleToggleOnline = async (): Promise<void> => {
    setToggling(true);
    try {
      if (online) {
        await apiClient.goOffline();
        setOnline(false);
      } else {
        await apiClient.goOnline();
        setOnline(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to toggle status';
      Alert.alert('Failed', msg);
    } finally {
      setToggling(false);
    }
  };

  const firstName = user?.fullName?.split(' ')[0] ?? 'Fundi';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Karibu, {firstName}</Text>
          <Text style={styles.subtitle}>{online ? 'You are online' : 'You are offline'}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={handleToggleOnline} disabled={toggling} activeOpacity={0.85}>
        <LinearGradient
          colors={online ? [colors.success, '#1F7A47'] : [gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.toggleBtn}
        >
          {toggling ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name={online ? 'power-outline' : 'flash-outline'} size={22} color={colors.primaryForeground} />
              <Text style={styles.toggleText}>{online ? 'Go Offline' : 'Go Online'}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {activeJob ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('JobDetail', { jobId: activeJob.id })}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[gradients.accent.start, gradients.accent.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activeCard}
          >
            <View style={styles.activeRow}>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active Job</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.accentForeground} />
            </View>
            <Text style={styles.activeCategory}>{activeJob.serviceCategory}</Text>
            <Text style={styles.activeDesc} numberOfLines={2}>
              {activeJob.description}
            </Text>
            <Text style={styles.activeCta}>Go to Job →</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.sectionTitle}>Earnings</Text>
      <View style={styles.row3}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Today</Text>
          <Text style={styles.statValue}>KES {dashboard?.earningsToday ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Week</Text>
          <Text style={styles.statValue}>KES {dashboard?.earningsWeek ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Month</Text>
          <Text style={styles.statValue}>KES {dashboard?.earningsMonth ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Performance</Text>
      <View style={styles.row3}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>{dashboard?.completedJobs ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Rating</Text>
          <Text style={styles.statValue}>{(dashboard?.rating ?? 0).toFixed(1)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Active</Text>
          <Text style={styles.statValue}>{dashboard?.activeJobs ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.quickCard}
            onPress={() => {
              const parent = navigation.getParent();
              parent?.navigate(action.tab);
            }}
          >
            <Ionicons name={action.icon} size={22} color={colors.primary} />
            <Text style={styles.quickLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  greeting: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    marginBottom: spacing.lg,
  },
  toggleText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    marginLeft: 8,
  },
  activeCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeBadge: {
    backgroundColor: colors.primaryForeground + '26',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  activeBadgeText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    fontWeight: '700',
  },
  activeCategory: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.accentForeground,
    textTransform: 'capitalize',
  },
  activeDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.accentForeground,
    marginTop: 4,
    opacity: 0.9,
  },
  activeCta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.accentForeground,
    fontWeight: '700',
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  row3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.text,
  },
});
