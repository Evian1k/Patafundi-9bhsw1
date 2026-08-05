import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  shadows,
  InfoPageScreen,
  InfoSection,
} from '@patafundi/shared';

interface VerificationStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const VERIFICATION_STEPS: VerificationStep[] = [
  { icon: 'cloud-upload', title: 'ID Upload', description: 'Fundi uploads a government-issued ID (national ID or passport).' },
  { icon: 'camera', title: 'Selfie Match', description: 'A live selfie is matched against the ID photo using facial recognition.' },
  { icon: 'document-text', title: 'Document Review', description: 'Our compliance team reviews the documents for authenticity.' },
  { icon: 'search', title: 'Background Check', description: 'We perform background screening in line with Kenyan regulations.' },
  { icon: 'checkmark-circle', title: 'Admin Approval', description: 'A senior reviewer grants Verified status.' },
];

interface BadgeInfo {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  description: string;
  color: string;
}

const BADGES: BadgeInfo[] = [
  { icon: 'checkmark-circle', name: 'Verified', description: 'Blue checkmark — passed identity, document, and selfie verification.', color: colors.info },
  { icon: 'star', name: 'Top-Rated', description: 'Gold star — maintains a 4.7+ rating over 25+ completed jobs.', color: '#F59E0B' },
  { icon: 'diamond', name: 'Elite', description: 'Platinum — top performers with 4.9+ rating and 100+ jobs completed.', color: '#7C3AED' },
];

const STATIC_SECTIONS: InfoSection[] = [
  {
    icon: 'information-circle',
    title: "What 'Verified' Means",
    body: 'Verified fundis have passed identity verification, document verification, and live selfie matching. Every verified fundi is a real person whose identity we have confirmed.',
    color: colors.info,
  },
  {
    icon: 'pulse',
    title: 'Continuous Monitoring',
    body: 'Ratings, customer reviews, completion rate, response time, and disputes are tracked on an ongoing basis. Fundis who fall below our thresholds are reviewed and may lose Verified status.',
    color: colors.accent,
    bullets: [
      'Rating must stay above 4.0',
      'Completion rate must stay above 85%',
      'Response time within 15 minutes during active jobs',
      'Disputes reviewed case by case',
    ],
  },
];

export function VerifiedFundisScreen({ navigation }: any): JSX.Element {
  return (
    <InfoPageScreen
      heroIcon="ribbon"
      heroTitle="Verified Fundis"
      heroSubtitle="Every fundi is identity-checked before they can serve you."
      heroGradient="accent"
      sections={STATIC_SECTIONS}
    >
      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <Ionicons name="git-network" size={20} color={colors.primary} />
          <Text style={styles.timelineTitle}>The Verification Process</Text>
        </View>
        <View style={styles.timeline}>
          {VERIFICATION_STEPS.map((step, idx) => (
            <View key={step.title} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={styles.timelineDot}>
                  <Ionicons name={step.icon} size={16} color={colors.primaryForeground} />
                </View>
                {idx < VERIFICATION_STEPS.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineStepTitle}>{step.title}</Text>
                <Text style={styles.timelineStepDesc}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.badgesCard}>
        <View style={styles.timelineHeader}>
          <Ionicons name="ribbon" size={20} color={colors.accent} />
          <Text style={styles.timelineTitle}>Verification Badges</Text>
        </View>
        <View style={styles.badgesWrap}>
          {BADGES.map((badge) => (
            <View key={badge.name} style={styles.badgeItem}>
              <View style={[styles.badgeIconWrap, { backgroundColor: badge.color + '20' }]}>
                <Ionicons name={badge.icon} size={24} color={badge.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeName}>{badge.name}</Text>
                <Text style={styles.badgeDesc}>{badge.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.reportCard}
        onPress={() => navigation.navigate('Support')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[gradients.danger.start, gradients.danger.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reportIconWrap}
        >
          <Ionicons name="flag" size={20} color={colors.primaryForeground} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportTitle}>Report a Fundi</Text>
          <Text style={styles.reportDesc}>
            Had a bad experience? Report it and our team will investigate.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </InfoPageScreen>
  );
}

const styles = StyleSheet.create({
  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  timelineTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  timeline: {
    paddingLeft: spacing.xs,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 14,
  },
  timelineLeft: {
    alignItems: 'center',
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
    minHeight: 24,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineStepTitle: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  timelineStepDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  badgesCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  badgesWrap: {
    gap: spacing.md,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  badgeDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  reportIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTitle: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  reportDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
