import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, fontSize, spacing, borderRadius, gradients } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

export function OtpScreen({ navigation, route }: any): JSX.Element {
  const email: string = route?.params?.email ?? '';
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<(TextInput | null)[]>([]);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleChange = (index: number, value: string): void => {
    if (value.length > 1) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleVerify = async (): Promise<void> => {
    clearError();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      Alert.alert('Invalid code', 'Please enter the 6-digit code.');
      return;
    }
    try {
      await verifyOtp(email, fullCode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      Alert.alert('Verification failed', msg);
    }
  };

  const handleResend = async (): Promise<void> => {
    if (cooldown > 0) return;
    try {
      await resendOtp(email);
      setCooldown(60);
      Alert.alert('Code sent', 'A new verification code has been sent.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Resend failed';
      Alert.alert('Resend failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}.</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.codeRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              style={[styles.codeInput, digit ? styles.codeInputActive : null]}
              value={digit}
              onChangeText={(v) => handleChange(i, v)}
              keyboardType="number-pad"
              maxLength={1}
              autoFocus={i === 0}
              selectionColor={colors.primary}
            />
          ))}
        </View>

        <TouchableOpacity onPress={handleVerify} disabled={loading} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Verify</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't receive a code? </Text>
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0}>
            <Text style={[styles.linkAccent, cooldown > 0 ? styles.linkDisabled : null]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
            </Text>
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  codeInput: {
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 14,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: fontSize.xxl,
    color: colors.text,
    backgroundColor: colors.card,
  },
  codeInputActive: {
    borderColor: colors.primary,
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  resendText: {
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
  linkDisabled: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
});
