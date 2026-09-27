import React from 'react';
import {
  colors,
  LEGAL_TRUST_CARDS,
  TrustCard,
  TrustCenterScreen as SharedTrustCenterScreen,
} from '@patafundi/shared';

const TRUST_CARDS: TrustCard[] = [
  { icon: 'shield-checkmark', title: 'Safety Promise', subtitle: 'Our commitment to your safety', color: colors.primary, route: 'SafetyPromise' },
  { icon: 'ribbon', title: 'Verified Fundis', subtitle: 'How fundis are vetted', color: colors.accent, route: 'VerifiedFundis' },
  { icon: 'wallet', title: 'Payment Protection', subtitle: 'Escrow-secured payments', color: colors.success, route: 'PaymentProtection' },
  { icon: 'calculator', title: 'How Pricing Works', subtitle: 'Transparent, fair pricing', color: '#8B5CF6', route: 'PricingExplained' },
  { icon: 'warning', title: 'Emergency SOS', subtitle: 'One-tap emergency help', color: colors.error, route: 'EmergencySos' },
  { icon: 'gift', title: 'Referral Program', subtitle: 'Earn by inviting friends', color: colors.primary, route: 'ReferralProgram' },
  { icon: 'trophy', title: 'Loyalty Program', subtitle: 'Rewards for loyal customers', color: '#F59E0B', route: 'LoyaltyProgram' },
  ...LEGAL_TRUST_CARDS,
];

export function TrustCenterScreen({ navigation }: any): JSX.Element {
  return (
    <SharedTrustCenterScreen
      navigation={navigation}
      cards={TRUST_CARDS}
      heroSubtitle="Your safety is our priority. Explore the protections that keep every PataFundi job secure."
    />
  );
}
