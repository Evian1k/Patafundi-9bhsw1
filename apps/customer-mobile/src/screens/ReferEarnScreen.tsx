import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  ScreenHeader,
} from '@patafundi/shared';
import type { Referral } from '@patafundi/shared';

interface ReferralState {
  data: Referral | null;
  loading: boolean;
  error: string | null;
}

const REWARD_STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  completed: colors.success,
  fulfilled: colors.success,
  failed: colors.error,
  expired: colors.textSecondary,
};

export function ReferEarnScreen({ navigation }: any): JSX.Element {
  const [state, setState] = useState<ReferralState>({
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiClient.getReferralDashboard();
      setState({ data, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load referral data';
      setState({ data: null, loading: false, error: msg });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopy = (): void => {
    const code = state.data?.code;
    if (!code) return;
    Alert.alert('Your referral code', code, [{ text: 'OK' }]);
  };

  const handleShare = async (): Promise<void> => {
    const code = state.data?.code;
    const link = state.data?.shareLink;
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on PataFundi! Use my referral code ${code} to get started. ${link ?? ''}`.trim(),
        url: link,
        title: 'PataFundi referral',
      });
    } catch {
      // ignore cancellation
    }
  };

  if (state.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyCircle}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>Couldn't load referrals</Text>
        <Text style={styles.emptyText}>{state.error}</Text>
        <TouchableOpacity onPress={load} activeOpacity={0.85} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const code = state.data?.code ?? '';
  const stats = state.data?.stats ?? { signups: 0, completedJobs: 0, vouchersEarned: 0, pendingRewards: 0 };
  const rewards = state.data?.rewards ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <ScreenHeader title="Refer & Earn" onBack={() => navigation.goBack()} />

      <LinearGradient
        colors={[gradients.primary.start, gradients.primary.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroBadge}>
          <Ionicons name="gift" size={22} color={colors.primaryForeground} />
        </View>
        <Text style={styles.heroTitle}>Refer &amp; Earn</Text>
        <Text style={styles.heroSubtitle}>
          Get KES 200 for every friend who completes their first job
        </Text>
      </LinearGradient>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your referral code</Text>
        <Text style={styles.codeValue}>{code || '—'}</Text>
        <View style={styles.codeActions}>
          <TouchableOpacity
            style={styles.codeBtn}
            onPress={handleCopy}
            activeOpacity={0.85}
            disabled={!code}
          >
            <Ionicons name="copy-outline" size={16} color={colors.accent} />
            <Text style={styles.codeBtnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.codeBtn, styles.codeBtnPrimary]}
            onPress={handleShare}
            activeOpacity={0.85}
            disabled={!code}
          >
            <Ionicons name="share-social-outline" size={16} color={colors.primaryForeground} />
            <Text style={[styles.codeBtnText, { color: colors.primaryForeground }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.signups}</Text>
          <Text style={styles.statLabel}>Signups</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.completedJobs}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.vouchersEarned}</Text>
          <Text style={styles.statLabel}>Vouchers</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.pendingRewards}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Reward history</Text>
      {rewards.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyCircle}>
            <Ionicons name="ribbon-outline" size={48} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>No rewards yet</Text>
          <Text style={styles.emptyText}>Start sharing your code!</Text>
        </View>
      ) : (
        <View style={styles.rewardsList}>
          {rewards.map((rw) => {
            const statusColor = REWARD_STATUS_COLORS[rw.status] ?? colors.textSecondary;
            return (
              <View key={rw.id} style={styles.rewardCard}>
                <View style={styles.rewardIconWrap}>
                  <Ionicons name="gift-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardType}>{rw.type}</Text>
                  <Text style={styles.rewardDate}>
                    {new Date(rw.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rewardValue}>KES {rw.value}</Text>
                  <View style={[styles.rewardStatus, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.rewardStatusText, { color: statusColor }]}>
                      {rw.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
  },
  heroSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
    opacity: 0.92,
  },
  codeCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  codeLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  codeValue: {
    fontFamily: fonts.display,
    fontWeight: '800',
    fontSize: 32,
    color: colors.text,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  codeBtnPrimary: {
    backgroundColor: colors.accent,
  },
  codeBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  rewardsList: {
    gap: 8,
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rewardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardType: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.text,
    textTransform: 'capitalize',
  },
  rewardDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rewardValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  rewardStatus: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.pill,
  },
  rewardStatusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  retryText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
});
