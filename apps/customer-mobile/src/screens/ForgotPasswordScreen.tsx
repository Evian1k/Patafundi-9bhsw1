import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  ScreenHeader,
  Input,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

export function ForgotPasswordScreen({ navigation }: any): JSX.Element {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleSubmit = async (): Promise<void> => {
    clearError();
    try {
      await forgotPassword(email.trim());
      setSubmitted(true);
      Alert.alert('Check your email', 'If the address exists, a reset link is on its way.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      Alert.alert('Request failed', msg);
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
          Enter your email and we'll send you a link to reset your password.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Send Reset Link</Text>
          </LinearGradient>
        </TouchableOpacity>

        {submitted ? (
          <Text style={styles.successText}>Reset link sent. Check your inbox.</Text>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Remembered it? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkAccent}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.text,
    marginTop: spacing.xl,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  btn: {
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  linkAccent: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.accent,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  successText: {
    color: colors.success,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
