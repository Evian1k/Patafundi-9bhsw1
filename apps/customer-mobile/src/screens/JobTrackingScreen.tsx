import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
} from '@patafundi/shared';
import type { Job } from '@patafundi/shared';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface FundiLocation {
  latitude: number;
  longitude: number;
}

export function JobTrackingScreen({ navigation, route }: any): JSX.Element {
  const jobId: string = route?.params?.jobId;
  const [job, setJob] = useState<Job | null>(null);
  const [fundiLoc, setFundiLoc] = useState<FundiLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJob = useCallback(async (): Promise<void> => {
    try {
      const data = await apiClient.getJob(jobId);
      setJob(data.job);
      if (data.job && (data.job.status === 'accepted' || data.job.status === 'in_progress')) {
        try {
          const loc = await apiClient.getJobLocation(jobId);
          if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
            setFundiLoc({ latitude: loc.latitude, longitude: loc.longitude });
          }
        } catch {
          // location may not be available
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load job';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadJob();
    const unsubscribe = apiClient.subscribeToJob(jobId, {
      onStatus: () => {
        loadJob();
      },
      onLocation: (p) => {
        if (p && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
          setFundiLoc({ latitude: p.latitude, longitude: p.longitude });
        }
      },
      onCompleted: () => {
        loadJob();
      },
      onCancelled: () => {
        loadJob();
      },
    });

    pollRef.current = setInterval(() => {
      loadJob();
    }, 10000);

    return () => {
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, loadJob]);

  const handleConfirmCompletion = async (): Promise<void> => {
    setActionLoading(true);
    try {
      await apiClient.confirmCompletion(jobId);
      Alert.alert('Confirmed', 'You have confirmed completion. Please rate your fundi.');
      loadJob();
      navigation.navigate('Review', { jobId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm';
      Alert.alert('Failed', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (): Promise<void> => {
    Alert.alert('Cancel job?', 'Are you sure you want to cancel this job?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await apiClient.cancelJob(jobId, 'Cancelled by customer');
            Alert.alert('Cancelled', 'The job has been cancelled.');
            loadJob();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to cancel';
            Alert.alert('Failed', msg);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Job not found.</Text>
      </View>
    );
  }

  const statusColor = JOB_STATUS_COLORS[job.status] ?? colors.textSecondary;
  const customerLat = job.customerLatitude ?? null;
  const customerLng = job.customerLongitude ?? null;
  const hasMap = (customerLat !== null && customerLng !== null) || fundiLoc !== null;

  const mapRegion: Region | undefined = hasMap
    ? {
        latitude: customerLat ?? fundiLoc?.latitude ?? -1.2864,
        longitude: customerLng ?? fundiLoc?.longitude ?? 36.8172,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : undefined;

  const showConfirm = job.status === 'completed' && !job.customer_completion_confirmed;
  const showReview = job.status === 'completed' && !job.hasReview;
  const showCancel = job.status === 'matching';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {hasMap && mapRegion ? (
        <MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
          {customerLat !== null && customerLng !== null ? (
            <Marker coordinate={{ latitude: customerLat, longitude: customerLng }} pinColor={colors.primary} title="You" />
          ) : null}
          {fundiLoc ? (
            <Marker coordinate={fundiLoc} pinColor={colors.accent} title="Fundi" />
          ) : null}
        </MapView>
      ) : null}

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{JOB_STATUS_LABELS[job.status] ?? job.status}</Text>
          </View>
          {job.urgency === 'emergency' ? (
            <View style={[styles.statusBadge, { backgroundColor: colors.error }]}>
              <Text style={styles.statusText}>Emergency</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.jobCategory}>{job.serviceCategory}</Text>
        <Text style={styles.jobDesc}>{job.description}</Text>

        {job.estimatedPrice ? (
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.detailText}>Budget: KES {job.estimatedPrice}</Text>
          </View>
        ) : null}
        {job.fundiName ? (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.detailText}>Fundi: {job.fundiName}</Text>
          </View>
        ) : null}
        {job.customerAddress ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.detailText}>{job.customerAddress}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Timeline</Text>
      <View style={styles.card}>
        {buildTimeline(job).map((t, i) => (
          <View key={i} style={styles.timelineRow}>
            <View style={[styles.timelineDot, t.active ? { backgroundColor: colors.primary } : null]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.timelineLabel, !t.active ? { color: colors.textSecondary } : null]}>{t.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('Chat', { jobId: job.id })}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
          <Text style={[styles.outlineBtnText, { color: colors.accent }]}>Chat</Text>
        </TouchableOpacity>

        {showConfirm ? (
          <TouchableOpacity onPress={handleConfirmCompletion} disabled={actionLoading} activeOpacity={0.85}>
            <LinearGradient
              colors={[colors.success, '#1F7A47']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBtn}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.btnText}>Confirm Completion</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {showReview ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('Review', { jobId: job.id })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBtn}
            >
              <Text style={styles.btnText}>Leave Review</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {showCancel ? (
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.error }]} onPress={handleCancel} disabled={actionLoading}>
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.outlineBtnText, { color: colors.error }]}>Cancel Job</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

interface TimelineItem {
  label: string;
  active: boolean;
}

function buildTimeline(job: Job): TimelineItem[] {
  const items: TimelineItem[] = [
    { label: 'Job posted', active: true },
    { label: 'Fundi matched', active: ['accepted', 'in_progress', 'completed'].includes(job.status) },
    { label: 'Work in progress', active: ['in_progress', 'completed'].includes(job.status) },
    { label: 'Completed', active: job.status === 'completed' },
  ];
  if (job.status === 'cancelled') items.push({ label: 'Cancelled', active: true });
  if (job.status === 'disputed') items.push({ label: 'Disputed', active: true });
  return items;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  map: {
    width: SCREEN_WIDTH,
    height: 240,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm,
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
    fontWeight: '700',
  },
  jobCategory: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    textTransform: 'capitalize',
  },
  jobDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  detailText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    marginLeft: 8,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.border,
  },
  timelineLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  actionsRow: {
    flexDirection: 'column',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
    marginLeft: 6,
  },
  gradientBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});
