import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  shadows,
  SERVICE_CATEGORIES,
  ScreenHeader,
  InfoHero,
  InfoSectionCard,
  InfoSection,
} from '@patafundi/shared';

interface PricingFactor {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}

const PRICING_FACTORS: PricingFactor[] = [
  { icon: 'grid', label: 'Service category', description: 'Each category has its own base rate.' },
  { icon: 'navigate', label: 'Distance to nearest fundi', description: 'Longer travel increases the price slightly.' },
  { icon: 'time', label: 'Estimated travel time', description: 'Traffic and route time are factored in.' },
  { icon: 'flame', label: 'Current demand', description: 'Busy periods may carry a small surge.' },
  { icon: 'warning', label: 'Emergency requests', description: 'Immediate dispatch adds an emergency fee.' },
  { icon: 'moon', label: 'Time of day', description: 'Late-night and early-morning jobs cost more.' },
  { icon: 'cloud', label: 'Weather conditions', description: 'Heavy rain or extreme heat adjust the price.' },
  { icon: 'location', label: 'Local market rates', description: 'Prices reflect the going rate in your county.' },
];

const TRANSPARENT_SECTION: InfoSection = {
  icon: 'eye',
  title: 'Transparent Pricing',
  body: 'You always see ONE final price before you confirm. No hidden charges, no surprises after the work is done.',
  color: colors.accent,
};

const HOW_IT_WORKS_SECTION: InfoSection = {
  icon: 'calculator',
  title: 'How It Works',
  body: 'Our pricing engine calculates a fair price based on multiple factors working together:',
  color: colors.primary,
};

const WHAT_YOU_SEE_SECTION: InfoSection = {
  icon: 'checkmark-done',
  title: 'What You See',
  body: 'Service · Estimated Arrival · Estimated Duration · Total Price. That\'s it. Nothing else is added later.',
  color: colors.success,
};

const NO_NEGOTIATION_SECTION: InfoSection = {
  icon: 'hand-right',
  title: 'No Negotiation Needed',
  body: 'The price is the price. You don\'t haggle with the fundi and the fundi doesn\'t haggle with you. Fair for everyone.',
  color: colors.info,
};

const SURGE_SECTION: InfoSection = {
  icon: 'trending-up',
  title: 'Surge Pricing',
  body: 'During periods of very high demand, prices may adjust slightly to make sure you can still get service fast. Surge is always shown upfront before you confirm.',
  color: colors.warning,
};

export function PricingExplainedScreen({ navigation }: any): JSX.Element {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <ScreenHeader title="How Pricing Works" onBack={() => navigation.goBack()} />

      <InfoHero
        heroIcon="calculator"
        heroTitle="How Pricing Works"
        heroSubtitle="One fair, transparent price — every time."
        heroGradient="primary"
      />

      <InfoSectionCard section={TRANSPARENT_SECTION} />

      <InfoSectionCard section={HOW_IT_WORKS_SECTION} />

      <View style={styles.factorsCard}>
        <View style={styles.factorsHeader}>
          <Ionicons name="options" size={18} color={colors.primary} />
          <Text style={styles.factorsHeaderTitle}>What the engine considers</Text>
        </View>
        <View style={styles.factorsList}>
          {PRICING_FACTORS.map((factor) => (
            <View key={factor.label} style={styles.factorRow}>
              <View style={styles.factorIconWrap}>
                <Ionicons name={factor.icon} size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.factorLabel}>{factor.label}</Text>
                <Text style={styles.factorDesc}>{factor.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.categoryCard}>
        <View style={styles.factorsHeader}>
          <Ionicons name="grid" size={18} color={colors.accent} />
          <Text style={styles.factorsHeaderTitle}>Service categories</Text>
        </View>
        <View style={styles.categoryGrid}>
          {SERVICE_CATEGORIES.map((cat) => (
            <View key={cat.slug} style={styles.categoryChip}>
              <View style={[styles.categoryIconWrap, { backgroundColor: cat.color + '20' }]}>
                <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={14} color={cat.color} />
              </View>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <InfoSectionCard section={WHAT_YOU_SEE_SECTION} />
      <InfoSectionCard section={NO_NEGOTIATION_SECTION} />
      <InfoSectionCard section={SURGE_SECTION} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  factorsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  factorsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  factorsHeaderTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  factorsList: {
    gap: spacing.sm,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  factorIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorLabel: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  factorDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  categoryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
  },
  categoryIconWrap: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '500',
  },
});
