import React from 'react';
import {
  colors,
  LEGAL_TRUST_CARDS,
  TrustCard,
  TrustCenterScreen,
} from '@patafundi/shared';

const TRUST_CARDS: TrustCard[] = [
  { icon: 'shield-checkmark', title: 'Safety Promise', subtitle: 'Our commitment to your safety', color: colors.primary, route: 'FundiSafetyPromise' },
  { icon: 'warning', title: 'Emergency SOS', subtitle: 'One-tap emergency help', color: colors.error, route: 'FundiEmergencySos' },
  { icon: 'ribbon', title: 'Verification', subtitle: 'Your verification status', color: colors.accent, route: 'Verification' },
  ...LEGAL_TRUST_CARDS,
];

export function FundiTrustCenterScreen({ navigation }: any): JSX.Element {
  return (
    <TrustCenterScreen
      navigation={navigation}
      cards={TRUST_CARDS}
      heroSubtitle="Safety and clarity for every fundi on the PataFundi platform."
    />
  );
}
