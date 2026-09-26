/**
 * FundiOtpScreen — Email verification after fundi registration.
 *
 * After submitting the registration form, the backend sends an OTP to the
 * fundi's email. This screen lets them enter the 6-digit code to verify.
 * On success, the user is navigated to PendingApproval (admin must approve).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient, colors, gradients, fonts, spacing, fontSize, borderRadius } from '@patafundi/shared';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export function FundiOtpScreen({ route, navigation }: any): JSX.Element {
  const { email, devOtp } = route.params || {};
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (devOtp) {
      Alert.alert('Dev Mode OTP', `Your OTP is: ${devOtp}`);
    }
  }, [devOtp]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleDigit = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste of full code
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      const newCode = Array(OTP_LENGTH).fill('');
      digits.forEach((d, i) => { newCode[i] = d; });
      setCode(newCode);
      if (digits.length === OTP_LENGTH) {
        inputRefs.current[OTP_LENGTH - 1]?.focus();
        Keyboard.dismiss();
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (index === OTP_LENGTH - 1 && value) {
      Keyboard.dismiss();
    }
  };

  const handleBackspace = (index: number) => {
    if (!code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = code.join('');
    if (otpCode.length < OTP_LENGTH) {
      Alert.alert('Incomplete', `Please enter all ${OTP_LENGTH} digits`);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.verifyOtp(email, otpCode);
      if (data.success) {
        Alert.alert(
          'Email Verified!',
          'Your email has been verified. Our team will review your application within 24 hours.',
          [{ text: 'OK', onPress: () => navigation.replace('PendingApproval') }],
        );
      } else {
        Alert.alert('Verification Failed', data.message || 'Invalid OTP code');
      }
    } catch (e: any) {
      Alert.alert('Verification Failed', e?.message || 'Please check your code and try again');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      const data = await apiClient.resendOtp(email);
      setCooldown(RESEND_COOLDOWN);
      if (data.devOtp) {
        Alert.alert('Dev Mode OTP', `Your new OTP is: ${data.devOtp}`);
      } else {
        Alert.alert('OTP Sent', `A new code has been sent to ${email}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not resend OTP');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name="mail-open-outline" size={32} color={colors.textLight} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>

        {/* OTP inputs */}
        <View style={styles.otpRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputRefs.current[i] = ref; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={(v) => handleDigit(i, v)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') handleBackspace(i);
              }}
              keyboardType="number-pad"
              maxLength={1}
              textContentType="oneTimeCode"
            />
          ))}
        </View>

        {/* Verify button */}
        <TouchableOpacity onPress={handleVerify} disabled={loading}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.verifyBtn}
          >
            {loading ? (
              <ActivityIndicator color={colors.textLight} />
            ) : (
              <Text style={styles.verifyBtnText}>Verify Email</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          onPress={handleResend}
          disabled={cooldown > 0}
          style={styles.resendBtn}
        >
          <Text style={styles.resendText}>
            {cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Didn't receive a code? Resend"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.md, marginTop: spacing.xl + spacing.sm },

  content: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },

  iconWrap: { marginBottom: spacing.xl },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },

  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontFamily: fonts.sans, fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl, lineHeight: 22 },
  email: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.text },

  otpRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: fontSize.xxl,
    fontFamily: fonts.display,
    fontWeight: '700',
    color: colors.text,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLighter },

  verifyBtn: {
    width: '100%',
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  verifyBtnText: { fontFamily: fonts.sans, fontSize: fontSize.md, fontWeight: '600', color: colors.textLight },

  resendBtn: { paddingVertical: spacing.sm },
  resendText: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.accent, fontWeight: '500' },
});
