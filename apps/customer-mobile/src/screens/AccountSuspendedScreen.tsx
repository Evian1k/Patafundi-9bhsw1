import React from 'react';
import {
  StyleSheet,
  Text,
  View,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function AccountSuspendedScreen({ route, navigation }: any): JSX.Element {
  const insets = useSafeAreaInsets();
  const reason: string = route?.params?.reason ?? 'Account activity that violates our policies';
  const caseId: string = route?.params?.caseId ?? '';
  const nextReviewDate: string = route?.params?.nextReviewDate ?? '';

  const handleAppeal = (): void => {
    if (navigation?.navigate) {
      navigation.navigate('Appeal', { caseId });
    }
  };

  const handleSupport = (): void => {
    if (navigation?.navigate) {
      navigation.navigate('Support');
    }
  };

  const handleAppealHistory = (): void => {
    if (navigation?.navigate) {
      navigation.navigate('Support');
    }
  };

  return (
    <LinearGradient
      colors={[gradients.primary.start, gradients.primary.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Account Under Review'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.contentWrap}>
        <View style={styles.card}>
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name="shield-half" size={42} color={colors.primaryForeground} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Account Under Review</Text>
        <Text style={styles.subtitle}>
          We take the safety of the PataFundi community seriously. Your account is temporarily under review.
        </Text>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>Reason for review</Text>
          <Text style={styles.reasonValue}>{reason}</Text>
        </View>

        {caseId ? (
          <View style={styles.rowCard}>
            <Ionicons name="pricetag" size={18} color={colors.accent} />
            <Text style={styles.rowLabel}>Case ID</Text>
            <Text style={styles.rowValue}>{caseId}</Text>
          </View>
        ) : null}

        {nextReviewDate ? (
          <View style={styles.rowCard}>
            <Ionicons name="calendar" size={18} color={colors.accent} />
            <Text style={styles.rowLabel}>Next review</Text>
            <Text style={styles.rowValue}>{nextReviewDate}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={handleAppeal} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtn}
          >
            <Ionicons name="document-text" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>Submit Appeal</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSupport} activeOpacity={0.7} style={styles.secondaryBtn}>
          <Ionicons name="headset" size={18} color={colors.accent} />
          <Text style={styles.secondaryBtnText}>Contact Support</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleAppealHistory} activeOpacity={0.7} style={styles.linkBtn}>
          <Text style={styles.linkText}>View Appeal History</Text>
        </TouchableOpacity>
      </View>

        <Text style={styles.footer}>
          Account reviews are conducted by our Trust &amp; Safety team. We appreciate your patience.
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  contentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.xl,
  },
  iconWrap: {
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  reasonCard: {
    width: '100%',
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reasonLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  reasonValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  rowValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  primaryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.primaryForeground,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  secondaryBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.accent,
  },
  linkBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  linkText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: spacing.xl,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    opacity: 0.75,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});
