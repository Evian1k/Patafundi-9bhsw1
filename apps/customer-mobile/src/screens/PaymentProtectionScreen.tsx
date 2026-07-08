import React from 'react';
import {
  StyleSheet,
  Text,
  View,
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
import { InfoPageScreen, InfoSection } from '../components/InfoPageScreen';

interface FlowStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const FLOW_STEPS: FlowStep[] = [
  { icon: 'phone-portrait', title: 'Customer Pays', description: 'You pay via M-Pesa STK push from within the app.' },
  { icon: 'lock-closed', title: 'Secure Escrow', description: 'Funds are held safely in escrow by PataFundi.' },
  { icon: 'build', title: 'Fundi Works', description: 'The fundi completes the agreed work at your location.' },
  { icon: 'checkmark-circle', title: 'Customer Confirms', description: 'You confirm the job is done to your satisfaction.' },
  { icon: 'cash', title: 'Payment Released', description: 'Funds are released to the fundi automatically.' },
];

const STATIC_SECTIONS: InfoSection[] = [
  {
    icon: 'shield-checkmark',
    title: 'Your money is held safely',
    body: 'From the moment you pay until the moment you confirm completion, your money sits in a secure escrow account — never in the fundi\'s hands until the work is done.',
    color: colors.success,
  },
  {
    icon: 'refresh',
    title: 'Refund process',
    body: 'If a job is cancelled or a dispute is resolved in your favor, the held amount is refunded to your original payment method within 3–5 business days.',
    color: colors.accent,
  },
  {
    icon: 'people',
    title: 'Dispute resolution',
    body: 'If you and the fundi disagree, file a dispute. Our team reviews evidence from both sides and mediates a fair outcome within 48 hours.',
    color: colors.warning,
  },
  {
    icon: 'lock-closed',
    title: 'M-Pesa protection',
    body: 'All M-Pesa payments are processed through the Safaricom Daraja API with end-to-end encryption. Your PIN is never seen or stored by PataFundi.',
    color: colors.success,
  },
  {
    icon: 'receipt',
    title: 'Receipts',
    body: 'Every transaction generates an instant receipt with the M-Pesa reference code, amount, and job details — sent to your app and email.',
    color: colors.primary,
  },
  {
    icon: 'time',
    title: 'Transaction history',
    body: 'A complete record of every payment, refund, and payout lives in your Wallet — searchable and exportable anytime.',
    color: colors.info,
  },
];

export function PaymentProtectionScreen(): JSX.Element {
  return (
    <InfoPageScreen
      heroIcon="wallet"
      heroTitle="Payment Protection"
      heroSubtitle="Your money is safe from the moment you pay until the job is done."
      heroGradient="success"
      sections={STATIC_SECTIONS}
    >
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Ionicons name="git-branch" size={20} color={colors.success} />
          <Text style={styles.flowTitle}>How money moves</Text>
        </View>
        <View style={styles.flowSteps}>
          {FLOW_STEPS.map((step, idx) => (
            <View key={step.title}>
              <View style={styles.flowStep}>
                <View style={styles.flowStepIconWrap}>
                  <Ionicons name={step.icon} size={22} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flowStepTitle}>{idx + 1}. {step.title}</Text>
                  <Text style={styles.flowStepDesc}>{step.description}</Text>
                </View>
              </View>
              {idx < FLOW_STEPS.length - 1 ? (
                <View style={styles.flowArrow}>
                  <Ionicons name="arrow-down" size={16} color={colors.textSecondary} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
        <LinearGradient
          colors={[gradients.success.start, gradients.success.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.flowBanner}
        >
          <Ionicons name="lock-closed" size={16} color={colors.primaryForeground} />
          <Text style={styles.flowBannerText}>Escrow-protected end to end</Text>
        </LinearGradient>
      </View>
    </InfoPageScreen>
  );
}

const styles = StyleSheet.create({
  flowCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  flowTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  flowSteps: {
    gap: spacing.xs,
  },
  flowStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  flowStepIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowStepTitle: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  flowStepDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  flowArrow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  flowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  flowBannerText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
  },
});
