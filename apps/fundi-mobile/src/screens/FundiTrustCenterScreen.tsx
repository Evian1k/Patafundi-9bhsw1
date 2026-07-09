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
} from '@patafundi/shared';

interface TrustCard {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  route: string;
  params?: Record<string, unknown>;
}

const TRUST_CARDS: TrustCard[] = [
  { icon: 'shield-checkmark', title: 'Safety Promise', subtitle: 'Our commitment to your safety', color: colors.primary, route: 'FundiSafetyPromise' },
  { icon: 'warning', title: 'Emergency SOS', subtitle: 'One-tap emergency help', color: colors.error, route: 'FundiEmergencySos' },
  { icon: 'ribbon', title: 'Verification', subtitle: 'Your verification status', color: colors.accent, route: 'Verification' },
  { icon: 'people', title: 'Community Guidelines', subtitle: 'How we treat each other', color: colors.accent, route: 'LegalPage', params: { slug: 'community-guidelines', title: 'Community Guidelines' } },
  { icon: 'book', title: 'Platform Rules', subtitle: 'Rules of the platform', color: colors.textSecondary, route: 'LegalPage', params: { slug: 'platform-rules', title: 'Platform Rules' } },
  { icon: 'lock-closed', title: 'Privacy Policy', subtitle: 'How we handle your data', color: colors.info, route: 'LegalPage', params: { slug: 'privacy-policy', title: 'Privacy Policy' } },
  { icon: 'document-text', title: 'Terms of Service', subtitle: 'The agreement between us', color: colors.textSecondary, route: 'LegalPage', params: { slug: 'terms-of-service', title: 'Terms of Service' } },
  { icon: 'nutrition', title: 'Cookies Policy', subtitle: 'How cookies are used', color: '#92400E', route: 'LegalPage', params: { slug: 'cookie-policy', title: 'Cookies Policy' } },
  { icon: 'refresh', title: 'Refund Policy', subtitle: 'When and how we refund', color: colors.success, route: 'LegalPage', params: { slug: 'refund-policy', title: 'Refund Policy' } },
];

export function FundiTrustCenterScreen({ navigation }: any): JSX.Element {
  const handlePress = (card: TrustCard): void => {
    if (card.params) {
      navigation.navigate(card.route, card.params);
    } else {
      navigation.navigate(card.route);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Trust & Safety'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <LinearGradient
        colors={[gradients.primary.start, gradients.primary.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroBadge}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primaryForeground} />
        </View>
        <Text style={styles.heroTitle}>Trust &amp; Safety</Text>
        <Text style={styles.heroSubtitle}>
          Safety and clarity for every fundi on the PataFundi platform.
        </Text>
      </LinearGradient>

      <View style={styles.grid}>
        {TRUST_CARDS.map((card) => (
          <TouchableOpacity
            key={card.title}
            style={styles.card}
            onPress={() => handlePress(card)}
            activeOpacity={0.8}
          >
            <View style={[styles.cardIcon, { backgroundColor: card.color + '18' }]}>
              <Ionicons name={card.icon} size={22} color={card.color} />
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>{card.subtitle}</Text>
            <View style={styles.cardChevron}>
              <Ionicons name="chevron-forward" size={16} color={card.color} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  hero: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroBadge: {
    width: 64,
    height: 64,
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
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  card: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 40,
  },
  cardSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    minHeight: 28,
  },
  cardChevron: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
});
