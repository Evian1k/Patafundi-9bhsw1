import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  shadows,
} from '@patafundi/shared';
import type { Loyalty } from '@patafundi/shared';
import { InfoSectionCard, InfoSection } from '../components/InfoPageScreen';

interface TierInfo {
  name: Loyalty['tier'];
  label: string;
  minPoints: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TIER_LADDER: TierInfo[] = [
  { name: 'bronze',   label: 'Bronze',   minPoints: 0,    color: '#92400E', icon: 'medal' },
  { name: 'silver',   label: 'Silver',   minPoints: 500,  color: '#64748B', icon: 'medal' },
  { name: 'gold',     label: 'Gold',     minPoints: 1500, color: '#F59E0B', icon: 'trophy' },
  { name: 'platinum', label: 'Platinum', minPoints: 5000, color: '#7C3AED', icon: 'diamond' },
];

interface BenefitRow {
  tier: string;
  benefits: string[];
  color: string;
}

const TIER_BENEFITS: BenefitRow[] = [
  { tier: 'Bronze',   color: '#92400E', benefits: ['Standard customer support', 'Access to all service categories'] },
  { tier: 'Silver',   color: '#64748B', benefits: ['Priority support', '5% discount on jobs over KES 2,000', 'Early access to new services'] },
  { tier: 'Gold',     color: '#F59E0B', benefits: ['Priority support', '10% discount on every job', 'Free re-service if quality is poor', 'Birthday bonus voucher'] },
  { tier: 'Platinum', color: '#7C3AED', benefits: ['Dedicated account manager', '15% discount on every job', 'One free minor service per month', 'Exclusive seasonal offers'] },
];

const EARN_POINTS_SECTION: InfoSection = {
  icon: 'add-circle',
  title: 'How to Earn Points',
  body: 'Stack up points and unlock higher tiers:',
  color: colors.primary,
  bullets: [
    'Complete a job — 10 points per KES 1,000 spent',
    'Leave a review after a job — 20 points each',
    'Refer a friend who completes a job — 100 points',
    'Maintain a perfect on-time record — bonus 50 points monthly',
  ],
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; loyalty: Loyalty };

export function LoyaltyProgramScreen(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });
    try {
      const resp = await apiClient.getLoyalty();
      setState({ status: 'ready', loyalty: resp.loyalty });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load loyalty data';
      setState({ status: 'error', message: msg });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <View style={styles.errorCircle}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
        </View>
        <Text style={styles.errorTitle}>Couldn't load loyalty</Text>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  const loyalty = state.loyalty;
  const tierInfo = TIER_LADDER.find((t) => t.name === loyalty.tier) ?? TIER_LADDER[0];
  const nextTier = TIER_LADDER.find((t) => t.minPoints > loyalty.points) ?? null;
  const currentTierMin = tierInfo.minPoints;
  const nextTierMin = nextTier?.minPoints ?? loyalty.points;
  const range = Math.max(1, nextTierMin - currentTierMin);
  const progress = nextTier
    ? Math.min(100, Math.max(0, ((loyalty.points - currentTierMin) / range) * 100))
    : 100;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <LinearGradient
        colors={[tierInfo.color, tierInfo.color + 'CC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.currentTierCard}
      >
        <View style={styles.tierIconWrap}>
          <Ionicons name={tierInfo.icon} size={32} color={colors.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tierName}>{tierInfo.label} Tier</Text>
          <Text style={styles.tierPoints}>{loyalty.points.toLocaleString()} points</Text>
        </View>
      </LinearGradient>

      {nextTier ? (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress to {nextTier.label}</Text>
            <Text style={styles.progressValue}>
              {loyalty.pointsToNextTier.toLocaleString()} pts to go
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <LinearGradient
              colors={[gradients.primary.start, gradients.primary.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBarFill, { width: `${progress}%` }]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.progressCard}>
          <View style={styles.maxTierRow}>
            <Ionicons name="trophy" size={20} color={colors.warning} />
            <Text style={styles.maxTierText}>You've reached the highest tier. Legend!</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Tier Ladder</Text>
      <View style={styles.ladderCard}>
        {TIER_LADDER.map((tier, idx) => {
          const isCurrent = tier.name === loyalty.tier;
          const isUnlocked = loyalty.points >= tier.minPoints;
          return (
            <View
              key={tier.name}
              style={[
                styles.ladderRow,
                idx < TIER_LADDER.length - 1 ? styles.ladderRowBorder : null,
              ]}
            >
              <View style={[styles.ladderIcon, { backgroundColor: tier.color + '20' }]}>
                <Ionicons
                  name={isUnlocked ? tier.icon : 'lock-closed'}
                  size={18}
                  color={tier.color}
                />
              </View>
              <Text style={styles.ladderLabel}>{tier.label}</Text>
              <Text style={styles.ladderPoints}>{tier.minPoints.toLocaleString()} pts</Text>
              {isCurrent ? (
                <View style={[styles.currentBadge, { backgroundColor: tier.color + '20' }]}>
                  <Text style={[styles.currentBadgeText, { color: tier.color }]}>You</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Benefits by Tier</Text>
      <View style={styles.benefitsWrap}>
        {TIER_BENEFITS.map((b) => (
          <View key={b.tier} style={styles.benefitCard}>
            <View style={styles.benefitHeader}>
              <View style={[styles.benefitDot, { backgroundColor: b.color }]} />
              <Text style={styles.benefitTier}>{b.tier}</Text>
            </View>
            {b.benefits.map((benefit, i) => (
              <View key={i} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={14} color={b.color} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Rewards History</Text>
      {loyalty.history.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No rewards earned yet. Complete a job to start earning!</Text>
        </View>
      ) : (
        <View style={styles.historyWrap}>
          {loyalty.history.map((h) => (
            <View key={h.id} style={styles.historyCard}>
              <View style={styles.historyIconWrap}>
                <Ionicons name="add-circle" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyReason}>{h.reason}</Text>
                <Text style={styles.historyDate}>{new Date(h.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.historyPoints}>+{h.points}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <InfoSectionCard section={EARN_POINTS_SECTION} />
      </View>
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
  errorCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  currentTierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  tierIconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierName: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.primaryForeground,
  },
  tierPoints: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    opacity: 0.92,
    marginTop: 2,
  },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  progressValue: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.pill,
  },
  maxTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  maxTierText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  ladderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  ladderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  ladderIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.text,
  },
  ladderPoints: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.pill,
    marginLeft: 6,
  },
  currentBadgeText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.xs,
  },
  benefitsWrap: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  benefitCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  benefitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  benefitDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.pill,
  },
  benefitTier: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  benefitText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  historyWrap: {
    gap: 8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyReason: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  historyDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyPoints: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.success,
  },
});
