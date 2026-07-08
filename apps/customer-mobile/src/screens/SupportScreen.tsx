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
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';

const CATEGORIES = ['General', 'Payment', 'Job issue', 'Account', 'Safety', 'Other'];

export function SupportScreen({ navigation }: any): JSX.Element {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Missing fields', 'Please provide subject and message.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
      });
      Alert.alert('Submitted', 'Our support team will contact you shortly.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit';
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
        <Text style={styles.title}>Contact support</Text>
        <Text style={styles.subtitle}>We're here to help. Tell us what's going on.</Text>

        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Briefly describe your issue"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipsRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, category === c ? styles.chipActive : null]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, category === c ? styles.chipTextActive : null]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={styles.textarea}
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your issue in detail..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={6}
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
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: spacing.md,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.card,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accentForeground,
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
