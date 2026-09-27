import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  ScreenHeader,
  Input,
  PrimaryButton,
} from '@patafundi/shared';

/**
 * Fundi password reset (spec §52): request a reset email. Completes the auth
 * story for fundis - previously this app had no way to recover an account.
 */
export function FundiForgotPasswordScreen({ navigation }: any): JSX.Element {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Email required', 'Enter the email address on your account.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.forgotPassword(email.trim());
      setSent(true);
      Alert.alert('Check your email', 'If the address exists, a reset link is on its way.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      Alert.alert('Request failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Reset Password" onBack={() => navigation.goBack()} />

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter your account email and we will send you a link to set a new password.
        </Text>

        {sent ? (
          <View style={styles.sentCard}>
            <Text style={styles.sentTitle}>Request sent</Text>
            <Text style={styles.sentText}>
              Check your inbox for the reset link. If it does not arrive within a few minutes,
              check your spam folder.
            </Text>
          </View>
        ) : (
          <View>
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
            <PrimaryButton
              label={submitting ? 'Sending...' : 'Send reset link'}
              onPress={handleSubmit}
              loading={submitting}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}

        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text onPress={() => navigation.goBack()} style={styles.backToLogin}>
            Back to login
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sentCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
  },
  sentTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.success,
  },
  sentText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  backToLogin: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
});
