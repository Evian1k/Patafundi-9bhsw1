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
import { colors, fonts, fontSize, spacing, borderRadius, gradients } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui';

export function LoginScreen({ navigation }: any): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleLogin = async (): Promise<void> => {
    clearError();
    try {
      await login(email.trim(), password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      Alert.alert('Sign in failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandWrap}>
          <Text style={styles.logo}>PataFundi</Text>
          <Text style={styles.tagline}>Trusted local fundis, on demand.</Text>
        </View>

        <View style={styles.card}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotWrap}>
            <Text style={styles.linkAccent}>Forgot password?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkAccent}>Sign up</Text>
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
    justifyContent: 'center',
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.hero,
    color: colors.primary,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 6,
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
  forgotWrap: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
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
