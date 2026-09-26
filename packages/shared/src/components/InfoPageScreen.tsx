import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ViewStyle,
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
} from '../theme';

export interface InfoSection {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  color?: string;
  bullets?: string[];
}

export interface InfoPageScreenProps {
  heroIcon: keyof typeof Ionicons.glyphMap;
  heroTitle: string;
  heroSubtitle?: string;
  heroGradient?: keyof typeof gradients;
  sections: InfoSection[];
  footer?: React.ReactNode;
  children?: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}

export function InfoSectionCard({ section }: { section: InfoSection }): JSX.Element {
  const tint = section.color ?? colors.primary;
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: tint + '18' }]}>
          <Ionicons name={section.icon} size={20} color={tint} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      {section.body ? <Text style={styles.sectionBody}>{section.body}</Text> : null}
      {section.bullets && section.bullets.length > 0 ? (
        <View style={styles.bulletsWrap}>
          {section.bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: tint }]} />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function InfoHero({
  heroIcon,
  heroTitle,
  heroSubtitle,
  heroGradient = 'primary',
}: {
  heroIcon: keyof typeof Ionicons.glyphMap;
  heroTitle: string;
  heroSubtitle?: string;
  heroGradient?: keyof typeof gradients;
}): JSX.Element {
  const gradient = gradients[heroGradient];
  return (
    <View style={styles.heroWrap}>
      <LinearGradient
        colors={[gradient.start, gradient.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCircle}
      >
        <Ionicons name={heroIcon} size={36} color={colors.primaryForeground} />
      </LinearGradient>
      {heroTitle ? <Text style={styles.heroTitle}>{heroTitle}</Text> : null}
      {heroSubtitle ? <Text style={styles.heroSubtitle}>{heroSubtitle}</Text> : null}
    </View>
  );
}

export function InfoPageScreen({
  heroIcon,
  heroTitle,
  heroSubtitle,
  heroGradient = 'primary',
  sections,
  footer,
  children,
  contentContainerStyle,
}: InfoPageScreenProps): JSX.Element {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      <InfoHero
        heroIcon={heroIcon}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        heroGradient={heroGradient}
      />

      {children}

      <View style={styles.sectionsWrap}>
        {sections.map((section, idx) => (
          <InfoSectionCard key={`${section.title}-${idx}`} section={section} />
        ))}
      </View>

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroWrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  heroCircle: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.glow,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  sectionsWrap: {
    gap: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.sm,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  sectionBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bulletsWrap: {
    marginTop: spacing.sm,
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.pill,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
});
