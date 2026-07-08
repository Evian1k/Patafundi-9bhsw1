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
  SERVICE_CATEGORIES,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui';

export function EditProfileScreen({ navigation }: any): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [bio, setBio] = useState('');
  const [serviceCategory, setServiceCategory] = useState<string>('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const data = await apiClient.getFundiProfile();
        const fundi = data.fundi as Record<string, unknown> | undefined;
        if (fundi) {
          setBio((fundi.bio as string) ?? '');
          setServiceCategory((fundi.serviceCategory as string) ?? '');
          setYearsExperience(
            fundi.yearsExperience != null ? String(fundi.yearsExperience) : '',
          );
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async (): Promise<void> => {
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.updateProfile({ fullName: fullName.trim(), phone: phone.trim() });
      await apiClient.updateFundiProfile({
        bio: bio.trim(),
        serviceCategory: serviceCategory || undefined,
        yearsExperience: yearsExperience ? parseInt(yearsExperience, 10) : undefined,
      });
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Short description of your services"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Service category</Text>
        <View style={styles.categoryRow}>
          {SERVICE_CATEGORIES.map((cat) => {
            const active = serviceCategory === cat.slug;
            return (
              <TouchableOpacity
                key={cat.slug}
                style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                onPress={() => setServiceCategory(cat.slug)}
              >
                <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryChipText,
                    active ? styles.categoryChipTextActive : null,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          label="Years of experience"
          value={yearsExperience}
          onChangeText={setYearsExperience}
          placeholder="5"
          keyboardType="numeric"
        />

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
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipIcon: {
    fontSize: 14,
  },
  categoryChipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
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
