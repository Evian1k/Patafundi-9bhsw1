import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
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
  type Job,
} from '@patafundi/shared';
import { useFundiLocation } from '../hooks/useFundiLocation';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PhotoAsset {
  uri: string;
  type?: string;
  name?: string;
}

interface FundiLocation {
  latitude: number;
  longitude: number;
}

export function JobDetailScreen({ navigation, route }: any): JSX.Element {
  const jobId: string = route?.params?.jobId;
  const [job, setJob] = useState<Job | null>(null);
  const [fundiLoc, setFundiLoc] = useState<FundiLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);

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
    void loadJob();
    const unsubscribe = apiClient.subscribeToJob(jobId, {
      onStatus: () => {
        void loadJob();
      },
      onLocation: (p) => {
        if (p && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
          setFundiLoc({ latitude: p.latitude, longitude: p.longitude });
        }
      },
      onCompleted: () => {
        void loadJob();
      },
      onCancelled: () => {
        void loadJob();
      },
    });
    return () => {
      unsubscribe();
    };
  }, [jobId, loadJob]);

  const isActive = job?.status === 'accepted' || job?.status === 'in_progress';
  useFundiLocation({ enabled: isActive, jobId });

  const handleNavigate = async (): Promise<void> => {
    if (!job || job.customerLatitude == null || job.customerLongitude == null) {
      Alert.alert('No location', 'Customer location is not available.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${job.customerLatitude},${job.customerLongitude}&travelmode=driving`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Maps unavailable', 'Could not open maps app.');
      return;
    }
    await Linking.openURL(url);
  };

  const handleCheckIn = async (): Promise<void> => {
    if (!job) return;
    setActionLoading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Location denied', 'Location is required to check in.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      await apiClient.checkIn(job.id, loc.coords.latitude, loc.coords.longitude);
      Alert.alert('Checked in', 'You have checked in. Work is now in progress.');
      void loadJob();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to check in';
      Alert.alert('Failed', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const pickPhotos = async (): Promise<void> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.7,
      });
      if (result.canceled) return;
      const picked: PhotoAsset[] = result.assets.map((a) => ({
        uri: a.uri,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to pick photos';
      Alert.alert('Photo error', msg);
    }
  };

  const handleComplete = async (): Promise<void> => {
    if (!job) return;
    if (photos.length === 0) {
      Alert.alert('Photos required', 'Please add at least one completion photo.');
      return;
    }
    setActionLoading(true);
    try {
      const response = await apiClient.completeJob(job.id, photos);
      // The backend returns a completion OTP that the fundi must give to the
      // customer. The customer enters this code to confirm completion + release payment.
      const otp = (response as any)?.completionOtp;
      if (otp) {
        Alert.alert(
          'Job Completed! 🎉',
          `Give this code to the customer:\n\n  ${otp}\n\nThey'll enter it to confirm completion and release your payment.`,
          [
            { text: 'Copy Code', onPress: () => { /* could use Clipboard */ } },
            { text: 'Done', onPress: () => navigation.goBack() },
          ],
        );
      } else {
        Alert.alert('Completed', 'Job has been marked complete. Ask the customer to confirm completion.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to complete job';
      Alert.alert('Failed', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = (): void => {
    if (!job) return;
    Alert.alert('Cancel job?', 'Are you sure you want to cancel this job?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await apiClient.cancelJob(job.id, 'Cancelled by fundi');
            Alert.alert('Cancelled', 'The job has been cancelled.');
            void loadJob();
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

  const handleSOS = (): void => {
    Alert.alert(
      'Trigger SOS',
      'This will alert PataFundi safety and your emergency contact. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              const perm = await Location.requestForegroundPermissionsAsync();
              let lat = 0;
              let lng = 0;
              if (perm.status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                lat = loc.coords.latitude;
                lng = loc.coords.longitude;
              }
              await apiClient.triggerSOS({
                jobId: job?.id,
                latitude: lat,
                longitude: lng,
                message: 'Fundi SOS triggered',
              });
              Alert.alert('SOS sent', 'Help is on the way. Stay safe.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to trigger SOS';
              Alert.alert('Failed', msg);
            }
          },
        },
      ],
    );
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {hasMap && mapRegion ? (
        <MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
          {customerLat !== null && customerLng !== null ? (
            <Marker
              coordinate={{ latitude: customerLat, longitude: customerLng }}
              pinColor={colors.primary}
              title="Customer"
            />
          ) : null}
          {fundiLoc ? (
            <Marker coordinate={fundiLoc} pinColor={colors.accent} title="You" />
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
        {job.customerName ? (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.detailText}>Customer: {job.customerName}</Text>
          </View>
        ) : null}
        {job.customerAddress ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.detailText}>{job.customerAddress}</Text>
          </View>
        ) : null}
      </View>

      {job.status === 'in_progress' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Completion photos</Text>
          <Text style={styles.helperText}>Add up to 5 photos showing completed work.</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoThumb}>
                <Text style={styles.photoLabel}>{i + 1}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhotos}>
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.actionsCol}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('JobChat', { jobId: job.id })}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
          <Text style={[styles.outlineBtnText, { color: colors.accent }]}>Chat</Text>
        </TouchableOpacity>

        {job.status === 'accepted' ? (
          <>
            <TouchableOpacity onPress={handleNavigate} activeOpacity={0.85}>
              <LinearGradient
                colors={[gradients.accent.start, gradients.accent.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBtn}
              >
                <Ionicons name="navigate-outline" size={18} color={colors.accentForeground} />
                <Text style={styles.btnText}>Navigate</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCheckIn} disabled={actionLoading} activeOpacity={0.85}>
              <LinearGradient
                colors={[gradients.primary.start, gradients.primary.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBtn}
              >
                {actionLoading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="location-outline" size={18} color={colors.primaryForeground} />
                    <Text style={styles.btnText}>Check In</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : null}

        {job.status === 'in_progress' ? (
          <TouchableOpacity onPress={handleComplete} disabled={actionLoading} activeOpacity={0.85}>
            <LinearGradient
              colors={[colors.success, '#1F7A47']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBtn}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryForeground} />
                  <Text style={styles.btnText}>Complete Job</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: colors.error }]}
          onPress={handleSOS}
        >
          <Ionicons name="warning-outline" size={18} color={colors.error} />
          <Text style={[styles.outlineBtnText, { color: colors.error }]}>SOS</Text>
        </TouchableOpacity>

        {job.status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.error }]}
            onPress={handleCancel}
            disabled={actionLoading}
          >
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.outlineBtnText, { color: colors.error }]}>Cancel Job</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
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
    marginBottom: spacing.xs,
  },
  helperText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primary,
  },
  addPhotoBtn: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  actionsCol: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    marginLeft: 6,
  },
});
