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
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';

export function ReviewScreen({ route, navigation }: any): JSX.Element {
  const jobId: string = route?.params?.jobId;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.submitReview(jobId, rating, comment.trim());
      Alert.alert('Thank you', 'Your review has been submitted.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit review';
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
        <Text style={styles.title}>Rate your fundi</Text>
        <Text style={styles.subtitle}>Your feedback helps us improve the platform.</Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} style={styles.star}>
              <Ionicons
                name={n <= rating ? 'star' : 'star-outline'}
                size={42}
                color={n <= rating ? colors.warning : colors.border}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingLabel}>{rating > 0 ? `${rating} / 5` : 'Tap to rate'}</Text>

        <Text style={styles.label}>Comment (optional)</Text>
        <TextInput
          style={styles.textarea}
          value={comment}
          onChangeText={setComment}
          placeholder="Tell us about your experience..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

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
              <Text style={styles.btnText}>Submit Review</Text>
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
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  star: {
    padding: 6,
  },
  ratingLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
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
