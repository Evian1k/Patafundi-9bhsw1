import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
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
  JOB_STATUS_LABELS,
  type Job,
} from '@patafundi/shared';

type Segment = 'available' | 'mine';

export function JobsScreen({ navigation }: any): JSX.Element {
  const [segment, setSegment] = useState<Segment>('available');
  const [available, setAvailable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        apiClient.listJobs({ status: 'matching', limit: 50 }),
        apiClient.listJobs({ limit: 100 }),
      ]);
      if (results[0].status === 'fulfilled') setAvailable(results[0].value.jobs || []);
      if (results[1].status === 'fulfilled') {
        const myJobs = (results[1].value.jobs || []).filter(
          (j) => j.status === 'accepted' || j.status === 'in_progress',
        );
        setMine(myJobs);
      }
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

  const handleAccept = async (jobId: string): Promise<void> => {
    setAccepting(jobId);
    try {
      await apiClient.acceptJob(jobId);
      Alert.alert('Accepted', 'You have accepted this job.', [
        { text: 'OK', onPress: () => navigation.navigate('JobDetail', { jobId }) },
      ]);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to accept job';
      Alert.alert('Failed', msg);
    } finally {
      setAccepting(null);
    }
  };

  const renderItem = ({ item }: { item: Job }): JSX.Element => {
    const isAvailable = segment === 'available';
    return (
      <View style={styles.jobCard}>
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
            {!isAvailable ? (
              <View style={[styles.statusBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.statusText}>{JOB_STATUS_LABELS[item.status] ?? item.status}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.actionsRow}>
          {isAvailable ? (
            <TouchableOpacity
              onPress={() => void handleAccept(item.id)}
              disabled={accepting === item.id}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.success, '#1F7A47']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.acceptBtn}
              >
                {accepting === item.id ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
            >
              <Text style={[styles.outlineBtnText, { color: colors.accent }]}>View Details</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const data = segment === 'available' ? available : mine;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jobs</Text>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, segment === 'available' ? styles.segmentActive : null]}
          onPress={() => setSegment('available')}
        >
          <Text style={[styles.segmentText, segment === 'available' ? styles.segmentTextActive : null]}>
            Available
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, segment === 'mine' ? styles.segmentActive : null]}
          onPress={() => setSegment('mine')}
        >
          <Text style={[styles.segmentText, segment === 'mine' ? styles.segmentTextActive : null]}>
            My Jobs
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {segment === 'available'
                  ? 'No available jobs matching your category right now. Pull to refresh.'
                  : 'You have no active jobs. Accept one from the Available tab.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: 4,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  segmentTextActive: {
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
    alignItems: 'flex-start',
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
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
    marginTop: 6,
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  actionsRow: {
    marginTop: spacing.md,
  },
  acceptBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  outlineBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
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
