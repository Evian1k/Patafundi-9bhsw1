import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';

interface PhotoAsset {
  uri: string;
  type?: string;
  name?: string;
}

const REASONS = [
  'Quality of work',
  'Damaged property',
  'Unprofessional conduct',
  'Pricing dispute',
  'No-show',
  'Safety concern',
  'Other',
];

export function CreateDisputeScreen({ route, navigation }: any): JSX.Element {
  const fixedJobId: string | undefined = route?.params?.jobId;
  // When opened without a job, the user picks from their REAL jobs - nobody
  // should ever have to find and type a Job ID (web parity, user directive).
  const [jobs, setJobs] = useState<Array<{ id: string; description?: string; status?: string; created_at?: string }>>([]);
  const [jobsLoading, setJobsLoading] = useState<boolean>(!fixedJobId);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(fixedJobId);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (fixedJobId) return;
    let alive = true;
    (async () => {
      try {
        const resp = await apiClient.listJobs();
        if (alive) setJobs(resp.jobs || []);
      } catch {
        if (alive) setJobs([]);
      } finally {
        if (alive) setJobsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fixedJobId]);

  const pickPhotos = async (): Promise<void> => {
    setPickerOpen(true);
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
        name: `evidence-${Date.now()}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to pick photo';
      Alert.alert('Photo error', msg);
    } finally {
      setPickerOpen(false);
    }
  };

  const removePhoto = (index: number): void => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selectedJobId) {
      Alert.alert('Job required', 'Please choose the job this dispute is about.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe the issue.');
      return;
    }
    setSubmitting(true);
    try {
      // Backend stores the reason field only - fold the description into it
      // so details are never lost (same contract the web app uses).
      const { dispute } = await apiClient.createDispute({
        jobId: selectedJobId,
        reason: `${reason}: ${description.trim()}`,
        description: description.trim(),
      });
      if (photos.length > 0) {
        try {
          await apiClient.uploadDisputeEvidence(dispute.id, photos);
        } catch {
          // evidence optional
        }
      }
      Alert.alert('Dispute filed', 'We will investigate and get back to you.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit dispute';
      Alert.alert('Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {!fixedJobId ? (
          <View>
            <Text style={styles.label}>Which job is this about?</Text>
            {jobsLoading ? (
              <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} />
            ) : jobs.length === 0 ? (
              <Text style={styles.jobMeta}>You have no jobs to report yet. Disputes are tied to a booking.</Text>
            ) : (
              <View style={styles.jobList}>
                {jobs.slice(0, 30).map((j) => {
                  const active = selectedJobId === j.id;
                  return (
                    <TouchableOpacity
                      key={j.id}
                      style={[styles.jobRow, active ? styles.jobRowActive : null]}
                      onPress={() => setSelectedJobId(j.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.jobTitle} numberOfLines={1}>{j.description || 'Job'}</Text>
                        <Text style={styles.jobMeta}>{j.status || ''}{j.created_at ? ` - ${new Date(j.created_at).toLocaleDateString()}` : ''}</Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        <Text style={styles.label}>Reason</Text>
        <View style={styles.reasonsWrap}>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.reasonChip, reason === r ? styles.reasonChipActive : null]}
              onPress={() => setReason(r)}
            >
              <Text style={[styles.reasonChipText, reason === r ? styles.reasonChipTextActive : null]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textarea}
          value={description}
          onChangeText={setDescription}
          placeholder="Provide details about the issue..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Evidence photos (optional, up to 5)</Text>
        <View style={styles.photoRow}>
          {photos.map((_p, i) => (
            <View key={i} style={styles.photoBox}>
              <Ionicons name="image" size={22} color={colors.textSecondary} />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
                <Ionicons name="close-circle" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 ? (
            <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos} disabled={pickerOpen}>
              <Ionicons name="add" size={24} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.btnText}>Submit</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: spacing.md,
    fontWeight: '500',
  },
  reasonsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  jobList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  jobRowActive: {
    backgroundColor: `${colors.primary}14`,
  },
  jobTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
  jobMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonChipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  reasonChipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '700',
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.card,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 120,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 6,
  },
  photoBox: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.card,
    borderRadius: borderRadius.pill,
  },
  addPhoto: {
    width: 72,
    height: 72,
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
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});
