import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Share,
  Alert,
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

interface InviteOption {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  color: string;
}

const INVITE_OPTIONS: InviteOption[] = [
  { icon: 'qr-code', label: 'Share your code', description: 'Show your code to friends in person', color: colors.primary },
  { icon: 'link', label: 'Share your link', description: 'Send your personal referral link', color: colors.accent },
  { icon: 'logo-whatsapp', label: 'WhatsApp', description: 'Invite friends on WhatsApp', color: '#25D366' },
  { icon: 'chatbubble', label: 'SMS', description: 'Text your code to a friend', color: colors.info },
];

const HOW_IT_WORKS_SECTION: InfoSection[] = [
  {
    icon: 'git-branch',
    title: 'How It Works',
    body: 'Three simple steps to earn:',
    color: colors.primary,
    bullets: [
      'Share your unique referral code with a friend',
      'Friend signs up on PataFundi using your code',
      'You both get rewarded when they complete their first job',
    ],
  },
  {
    icon: 'gift',
    title: 'Rewards',
    body: 'You earn a KES 200 voucher every time a referred friend completes their first paid job. Your friend gets KES 100 off their first booking. Vouchers appear in your wallet and never expire for 30 days.',
    color: colors.accent,
  },
  {
    icon: 'checkmark-circle',
    title: 'Terms',
    body: 'A few simple conditions:',
    color: colors.info,
    bullets: [
      'Referred user must be a brand-new PataFundi account',
      'One referral per device (no duplicates)',
      'Voucher expires 30 days after issuance',
      'Reward unlocks only after the friend\'s first job is completed and paid',
    ],
  },
  {
    icon: 'shield',
    title: 'Fair Use',
    body: 'Self-referrals, fake accounts, and bulk sign-ups are not allowed. Accounts that abuse the program may lose referral privileges and forfeit pending rewards.',
    color: colors.warning,
  },
];

export function ReferralProgramScreen({ navigation }: any): JSX.Element {
  const handleInvite = (option: InviteOption): void => {
    if (option.icon === 'logo-whatsapp') {
      const url = `https://wa.me/?text=${encodeURIComponent('Join me on PataFundi! Use my referral code to get KES 100 off your first job.')}`;
      Linking.canOpenURL(url).then((ok) => {
        if (ok) Linking.openURL(url).catch(() => {});
      }).catch(() => {});
      return;
    }
    if (option.icon === 'chatbubble') {
      const url = `sms:?body=${encodeURIComponent('Join me on PataFundi! Use my referral code to get KES 100 off your first job.')}`;
      Linking.canOpenURL(url).then((ok) => {
        if (ok) Linking.openURL(url).catch(() => {});
      }).catch(() => {});
      return;
    }
    if (option.icon === 'qr-code') {
      Alert.alert('Share your code', 'Open Refer & Earn to view your QR code and shareable code.');
      return;
    }
    void Share.share({
      message: 'Join me on PataFundi! Use my referral code to get KES 100 off your first job.',
      title: 'PataFundi referral',
    }).catch(() => {});
  };

  return (
    <View style={styles.outer}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Referral Program'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <InfoPageScreen
        heroIcon="gift"
        heroTitle="Referral Program"
        heroSubtitle="Earn KES 200 for every friend who completes their first job."
        heroGradient="primary"
        sections={HOW_IT_WORKS_SECTION}
      >
      <View style={styles.inviteCard}>
        <View style={styles.inviteHeader}>
          <Ionicons name="share-social" size={20} color={colors.primary} />
          <Text style={styles.inviteTitle}>How to Invite</Text>
        </View>
        <View style={styles.inviteList}>
          {INVITE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.inviteRow}
              onPress={() => handleInvite(opt)}
              activeOpacity={0.7}
            >
              <View style={[styles.inviteIconWrap, { backgroundColor: opt.color + '20' }]}>
                <Ionicons name={opt.icon} size={18} color={opt.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteLabel}>{opt.label}</Text>
                <Text style={styles.inviteDesc}>{opt.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('ReferEarn')}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[gradients.accent.start, gradients.accent.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.historyBtn}
        >
          <Ionicons name="time" size={18} color={colors.accentForeground} />
          <Text style={styles.historyBtnText}>View Referral History</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentForeground} />
        </LinearGradient>
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
  inviteCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  inviteTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  inviteList: {
    gap: 8,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  inviteIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLabel: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  inviteDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  historyBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.accentForeground,
  },
});
