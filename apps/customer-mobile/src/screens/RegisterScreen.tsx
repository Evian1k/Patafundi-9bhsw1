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

export function RegisterScreen({ navigation }: any): JSX.Element {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+254');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleRegister = async (): Promise<void> => {
    clearError();
    try {
      await register(email.trim(), password, fullName.trim(), phone.trim(), referralCode.trim() || undefined);
      Alert.alert('Account created', 'A verification code has been sent to your email.');
      navigation.replace('Otp', { email: email.trim() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      Alert.alert('Sign up failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Create Account" onBack={() => navigation.goBack()} />

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join PataFundi to hire trusted fundis.</Text>

        <View style={styles.card}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Input label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Doe" />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+254712345678"
            keyboardType="phone-pad"
          />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          <Input
            label="Referral code (optional)"
            value={referralCode}
            onChangeText={setReferralCode}
            placeholder="ABC123"
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Sign Up</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
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
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
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
    marginTop: spacing.lg,
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
});
