import React, { useState } from 'react';
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
  shadows,
} from '@patafundi/shared';

interface PhotoAsset {
  uri: string;
  type?: string;
  name?: string;
}

interface AppealRecord {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

const REASON_OPTIONS = [
  { value: 'false allegation', label: 'False allegation' },
  { value: 'misunderstanding', label: 'Misunderstanding' },
  { value: 'new evidence', label: 'New evidence' },
  { value: 'other', label: 'Other' },
];

const PRIOR_APPEALS: AppealRecord[] = [
  // History placeholder populated by user's previously-submitted support tickets
  // (filtered by category=appeal). Shown as an empty state until a list endpoint is wired.
];

export function AppealScreen({ route, navigation }: any): JSX.Element {
  const caseId: string = route?.params?.caseId ?? '';
  const [reason, setReason] = useState<string>(REASON_OPTIONS[0].value);
  const [explanation, setExplanation] = useState('');
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        name: `appeal-${Date.now()}.jpg`,
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
    if (!explanation.trim()) {
      Alert.alert('Explanation required', 'Please tell us why you are appealing.');
      return;
    }
    setSubmitting(true);
    try {
      const subject = `Appeal: ${caseId || 'Unknown case'}`;
      const message = `Reason: ${reason}\n\n${explanation.trim()}`;
      await apiClient.createSupportTicket({
        subject,
        message,
        category: 'appeal',
        jobId: caseId || undefined,
      });
      Alert.alert(
        'Appeal submitted',
        'We will review your appeal and respond within 48 hours.',
        [{ text: 'OK', onPress: () => navigation?.goBack?.() }],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit appeal';
      Alert.alert('Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {caseId ? (
          <View style={styles.caseCard}>
            <Ionicons name="pricetag" size={18} color={colors.accent} />
            <Text style={styles.caseLabel}>Case ID</Text>
            <Text style={styles.caseValue}>{caseId}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Appeal reason</Text>
        <View style={styles.reasonsWrap}>
          {REASON_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.reasonChip, reason === opt.value ? styles.reasonChipActive : null]}
              onPress={() => setReason(opt.value)}
            >
              <Text style={[styles.reasonChipText, reason === opt.value ? styles.reasonChipTextActive : null]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Explanation</Text>
        <TextInput
          style={styles.textarea}
          value={explanation}
          onChangeText={setExplanation}
          placeholder="Tell us what happened and why you believe this decision should be reconsidered..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={6}
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
            style={styles.submitBtn}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={colors.primaryForeground} />
                <Text style={styles.submitBtnText}>Submit Appeal</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Appeal History</Text>
        {PRIOR_APPEALS.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="documents-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No prior appeals on record.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {PRIOR_APPEALS.map((rec) => (
              <View key={rec.id} style={styles.historyCard}>
                <View style={styles.historyIconWrap}>
                  <Ionicons name="document-text" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historySubject}>{rec.subject}</Text>
                  <Text style={styles.historyDate}>{new Date(rec.createdAt).toLocaleString()}</Text>
                </View>
                <View style={[styles.historyStatus, { backgroundColor: colors.warning + '20' }]}>
                  <Text style={[styles.historyStatusText, { color: colors.warning }]}>{rec.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  caseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  caseLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  caseValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
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
    minHeight: 140,
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
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.lg,
    height: 48,
    marginTop: spacing.xl,
  },
  submitBtnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    ...shadows.sm,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  historyList: {
    gap: 8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySubject: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  historyDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
  },
  historyStatusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
