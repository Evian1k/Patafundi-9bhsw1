import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, colors, fonts, fontSize, spacing, borderRadius, gradients } from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

type ApprovalState = 'checking' | 'pending' | 'rejected' | 'error';

export function PendingApprovalScreen(): JSX.Element {
  const logout = useAuthStore((s) => s.logout);
  const [state, setState] = useState<ApprovalState>('checking');
  const [message, setMessage] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const data = await apiClient.getApprovalStatus();
      const status = data?.status ?? 'pending';
      if (status === 'approved') {
        // RootNavigator will pick up via auth re-check; trigger reload
        setMessage('Approved! Reloading…');
        setState('pending');
        // Force a re-mount by reloading via fetchUser
        await useAuthStore.getState().fetchUser();
      } else if (status === 'rejected') {
        setState('rejected');
        setMessage(data?.message ?? 'Your application was not approved. Please contact support.');
      } else {
        setState('pending');
        setMessage(data?.message ?? 'Our team is reviewing your application.');
      }
    } catch {
      setState('error');
      setMessage('Could not reach the server. Tap refresh to try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(() => {
      void check();
    }, 30000);
    return () => clearInterval(interval);
  }, [check]);

  const handleSignOut = (): void => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const heading = state === 'rejected' ? 'Application Not Approved' : 'Application Under Review';
  const accentColor = state === 'rejected' ? colors.error : colors.warning;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}>
      <View style={styles.iconWrap}>
        {refreshing ? (
          <ActivityIndicator size="large" color={accentColor} />
        ) : (
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name="hourglass-outline" size={40} color={colors.primaryForeground} />
          </LinearGradient>
        )}
      </View>

      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.message}>{message || 'Our team is reviewing your application.'}</Text>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={[styles.statusValue, { color: accentColor }]}>
            {state === 'rejected' ? 'Rejected' : state === 'error' ? 'Unknown' : 'Pending'}
          </Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
        <Text style={styles.infoText}>
          Approval typically takes 1-2 business days. Keep the app open and we will refresh automatically.
        </Text>
      </View>

      <TouchableOpacity onPress={() => void check()} disabled={refreshing} activeOpacity={0.85}>
        <View style={styles.outlineBtn}>
          {refreshing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Refresh</Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSignOut} style={styles.signOutWrap}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  iconWrap: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    flex: 1,
    marginLeft: 4,
  },
  statusValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.accent + '14',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    marginLeft: 4,
  },
  outlineBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  outlineBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.lg,
  },
  signOutWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  signOutText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
