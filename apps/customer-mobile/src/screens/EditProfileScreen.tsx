import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
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
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui';

export function EditProfileScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone ?? '');
    }
  }, [user]);

  const handleSave = async (): Promise<void> => {
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.updateProfile({ fullName: fullName.trim(), phone: phone.trim() });
      await fetchUser();
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (): Promise<void> => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Missing fields', 'Please fill both password fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Weak password', 'New password must be at least 6 characters.');
      return;
    }
    setChangingPwd(true);
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      Alert.alert('Password updated', 'Your password has been changed.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to change password';
      Alert.alert('Failed', msg);
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Profile details</Text>
        <Input label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Doe" />
        <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+254712345678" keyboardType="phone-pad" />

        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.btnText}>Save</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Change password</Text>
        <Input
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        <Input
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        <TouchableOpacity onPress={handleChangePassword} disabled={changingPwd} activeOpacity={0.85}>
          <View style={[styles.outlineBtn, { borderColor: colors.accent }]}>
            {changingPwd ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.outlineBtnText, { color: colors.accent }]}>Change Password</Text>
            )}
          </View>
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
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  outlineBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    marginTop: spacing.sm,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
  },
});
