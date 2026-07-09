import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
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
import { InfoPageScreen, InfoSectionCard, InfoSection } from '../components/InfoPageScreen';

interface EmergencyNumber {
  label: string;
  number: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { label: 'Police', number: '999', icon: 'shield', color: colors.info },
  { label: 'Police (alternate)', number: '112', icon: 'shield', color: colors.info },
  { label: 'Ambulance', number: '999', icon: 'medical', color: colors.error },
  { label: 'Fire', number: '999', icon: 'flame', color: '#EA580C' },
];

const SOS_STEPS: InfoSection[] = [
  {
    icon: 'location',
    title: 'Your location is shared',
    body: 'Your live GPS coordinates are sent to our support team instantly.',
    color: colors.error,
  },
  {
    icon: 'headset',
    title: 'Support team is alerted',
    body: 'Our safety team is notified and contacts you immediately on the phone number registered to your account.',
    color: colors.warning,
  },
  {
    icon: 'call',
    title: 'Emergency services contacted',
    body: 'If needed, we contact Kenyan emergency services (Police 999/112, Ambulance, Fire) on your behalf.',
    color: colors.info,
  },
  {
    icon: 'document-text',
    title: 'Incident is logged',
    body: 'A formal incident report is created and our team follows up within 24 hours.',
    color: colors.accent,
  },
];

const STATIC_SECTIONS: InfoSection[] = [
  {
    icon: 'warning',
    title: 'When to Use SOS',
    body: 'Only use SOS for genuine emergencies:',
    color: colors.error,
    bullets: [
      'Safety threat or physical danger',
      'Medical emergency',
      'Aggressive or threatening customer behavior',
      'Robbery or attempted robbery',
    ],
  },
  {
    icon: 'bulb',
    title: 'Safety Tips',
    body: 'Small habits that keep you safer on every job:',
    color: colors.warning,
    bullets: [
      'Confirm customer details match the app before arriving',
      'Share job details with a friend or family member',
      'Carry your ID and a charged phone at all times',
      'Trust your instincts — decline a job if something feels off',
      'Keep SOS accessible during the job',
    ],
  },
  {
    icon: 'checkmark-done',
    title: 'After SOS',
    body: 'Once SOS is triggered, we follow up with you within 24 hours. You can file a formal report, and the customer may be suspended pending investigation. Your safety always comes first.',
    color: colors.accent,
  },
];

export function FundiEmergencySosScreen({ navigation }: any): JSX.Element {
  const callNumber = (number: string): void => {
    const url = `tel:${number}`;
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url).catch(() => {});
    }).catch(() => {});
  };

  return (
    <View style={styles.outer}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Emergency SOS'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <InfoPageScreen
        heroIcon="warning"
        heroTitle="Emergency SOS"
        heroSubtitle="One tap connects you to support when safety is at risk."
        heroGradient="danger"
        sections={SOS_STEPS}
      >
      <LinearGradient
        colors={[gradients.danger.start, gradients.danger.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.warningCallout}
      >
        <View style={styles.warningIconWrap}>
          <Ionicons name="warning" size={20} color={colors.warningForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.warningTitle}>Only use SOS for real emergencies</Text>
          <Text style={styles.warningBody}>
            False alarms may result in account review and reduce response speed for those in genuine need.
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.stepsHeader}>
        <Ionicons name="flash" size={18} color={colors.error} />
        <Text style={styles.stepsTitle}>What Happens When You Press SOS</Text>
      </View>

      <View style={styles.numbersCard}>
        <View style={styles.numbersHeader}>
          <Ionicons name="call" size={20} color={colors.primary} />
          <Text style={styles.numbersTitle}>Emergency Numbers</Text>
        </View>
        <Text style={styles.numbersSubtitle}>Kenya national emergency services</Text>
        <View style={styles.numbersList}>
          {EMERGENCY_NUMBERS.map((num) => (
            <TouchableOpacity
              key={`${num.label}-${num.number}`}
              style={styles.numberRow}
              onPress={() => callNumber(num.number)}
              activeOpacity={0.7}
            >
              <View style={[styles.numberIconWrap, { backgroundColor: num.color + '20' }]}>
                <Ionicons name={num.icon} size={18} color={num.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.numberLabel}>{num.label}</Text>
                <Text style={styles.numberValue}>{num.number}</Text>
              </View>
              <Ionicons name="call" size={16} color={colors.success} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.staticWrap}>
        {STATIC_SECTIONS.map((section, idx) => (
          <InfoSectionCard key={`${section.title}-${idx}`} section={section} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.supportBtn}
        onPress={() => navigation.navigate('HelpCenter')}
        activeOpacity={0.85}
      >
        <Ionicons name="headset" size={18} color={colors.primaryForeground} />
        <Text style={styles.supportBtnText}>Contact Support Now</Text>
      </TouchableOpacity>
      </InfoPageScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
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
  warningCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  warningIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
    marginBottom: 2,
  },
  warningBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
    opacity: 0.95,
    lineHeight: 20,
  },
  stepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  stepsTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  numbersCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  numbersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  numbersTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  numbersSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  numbersList: {
    gap: 8,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  numberIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLabel: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  numberValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.text,
    marginTop: 2,
  },
  staticWrap: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  supportBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
});
