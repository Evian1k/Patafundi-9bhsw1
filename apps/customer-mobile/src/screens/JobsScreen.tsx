import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
} from '@patafundi/shared';
import type { Job } from '@patafundi/shared';

type FilterKey = 'all' | 'matching' | 'accepted' | 'in_progress' | 'completed';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'matching', label: 'Matching' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

export function JobsScreen({ navigation }: any): JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.listJobs({ limit: 50 });
      setJobs(resp.jobs || []);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadJobs();
    }, [loadJobs]),
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const filtered = jobs.filter((j) => (filter === 'all' ? true : j.status === filter));

  const renderItem = ({ item }: { item: Job }): JSX.Element => {
    const statusColor = JOB_STATUS_COLORS[item.status] ?? colors.textSecondary;
    return (
      <TouchableOpacity
        style={styles.jobCard}
        onPress={() => navigation.navigate('JobTracking', { jobId: item.id })}
      >
        <View style={styles.jobRow}>
          <View style={styles.jobIconWrap}>
            <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobCategory}>{item.serviceCategory}</Text>
            <Text style={styles.jobDesc} numberOfLines={1}>
              {item.description}
            </Text>
            {item.estimatedPrice ? (
              <Text style={styles.jobPrice}>KES {item.estimatedPrice}</Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{JOB_STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Jobs</Text>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key ? styles.chipActive : null]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key ? styles.chipTextActive : null]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadJobs} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {loading ? 'Loading jobs...' : 'No jobs found. Create one from the Home tab.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '700',
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
  jobPrice: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
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
    padding: spacing.xl,
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
