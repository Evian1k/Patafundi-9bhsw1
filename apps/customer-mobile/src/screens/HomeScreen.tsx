import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
  SERVICE_CATEGORIES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
} from '@patafundi/shared';
import type { Job, Referral } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

export function HomeScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [jobsResp, refResp] = await Promise.allSettled([
        apiClient.listJobs({ limit: 5 }),
        apiClient.getReferralDashboard(),
      ]);
      if (jobsResp.status === 'fulfilled') setJobs(jobsResp.value.jobs || []);
      if (refResp.status === 'fulfilled') setReferral(refResp.value);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hello, {firstName}</Text>
          <Text style={styles.subtitle}>What do you need today?</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          style={styles.bellWrap}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('CreateJob')} activeOpacity={0.85}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaBtn}
        >
          <Ionicons name="add-circle" size={22} color={colors.primaryForeground} />
          <Text style={styles.ctaText}>Create New Job</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Services</Text>
      <View style={styles.grid}>
        {SERVICE_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.slug}
            style={styles.categoryCard}
            onPress={() => navigation.navigate('CreateJob', { category: cat.slug })}
          >
            <Text style={styles.categoryIcon}>{cat.icon}</Text>
            <Text style={styles.categoryLabel}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {referral ? (
        <LinearGradient
          colors={[gradients.accent.start, gradients.accent.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.referralCard}
        >
          <Text style={styles.referralTitle}>Refer & earn</Text>
          <Text style={styles.referralCode}>Code: {referral.code}</Text>
          <Text style={styles.referralStats}>
            {referral.stats.signups} signups · {referral.stats.completedJobs} completed
          </Text>
        </LinearGradient>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent jobs</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Jobs')}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No jobs yet. Create your first job to get started.</Text>
        </View>
      ) : (
        jobs.map((job) => {
          const statusColor = JOB_STATUS_COLORS[job.status] ?? colors.textSecondary;
          return (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => navigation.navigate('JobTracking', { jobId: job.id })}
            >
              <View style={styles.jobRow}>
                <View style={styles.jobIconWrap}>
                  <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobCategory}>{job.serviceCategory}</Text>
                  <Text style={styles.jobDesc} numberOfLines={1}>
                    {job.description}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusText}>
                    {JOB_STATUS_LABELS[job.status] ?? job.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
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
  bellWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    marginBottom: spacing.lg,
  },
  ctaText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    marginLeft: 8,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginVertical: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '31%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  categoryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: 'center',
  },
  referralCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  referralTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.accentForeground,
  },
  referralCode: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.accentForeground,
    marginTop: 4,
    fontWeight: '600',
  },
  referralStats: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.accentForeground,
    marginTop: 4,
    opacity: 0.9,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  seeAll: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
  },
  jobCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  jobCategory: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
    textTransform: 'capitalize',
  },
  jobDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
