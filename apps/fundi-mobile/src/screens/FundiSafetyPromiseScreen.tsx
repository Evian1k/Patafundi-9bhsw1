import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, ScreenHeader, InfoPageScreen, InfoSection } from '@patafundi/shared';

const SECTIONS: InfoSection[] = [
  {
    icon: 'card',
    title: 'Identity Verification',
    body: 'Every fundi undergoes ID verification before approval. No anonymous providers on PataFundi.',
    color: '#F97316',
  },
  {
    icon: 'document-text',
    title: 'Document Verification',
    body: 'Government IDs, selfies, and certifications are reviewed by our team before a fundi can accept jobs.',
    color: '#1E9E8A',
  },
  {
    icon: 'analytics',
    title: 'Quality Monitoring',
    body: 'We continuously monitor fundi performance, ratings, and customer feedback to maintain service quality.',
    color: '#3B82F6',
  },
  {
    icon: 'shield',
    title: 'Fraud Prevention',
    body: 'Our system detects suspicious behavior, fake accounts, and payment fraud in real time.',
    color: '#EF4444',
  },
  {
    icon: 'navigate',
    title: 'GPS Tracking',
    body: "Customers can track your arrival in real-time. Stay on route to keep your rating high.",
    color: '#06B6D4',
  },
  {
    icon: 'lock-closed',
    title: 'Secure Payments',
    body: 'Payments are held in escrow until work is completed. You are guaranteed payment for every job you finish.',
    color: '#27A35F',
  },
  {
    icon: 'people',
    title: 'Dispute Resolution',
    body: 'If a customer files a dispute, we mediate fairly. Provide your side of the story through the dispute process.',
    color: '#F59E0B',
  },
  {
    icon: 'warning',
    title: 'Emergency Support',
    body: 'SOS button connects you to support instantly during any active job — for you or the customer.',
    color: '#EF4444',
  },
  {
    icon: 'lock-closed',
    title: 'Privacy Protection',
    body: 'Your data is encrypted in transit and at rest, and never shared without your consent.',
    color: '#8B5CF6',
  },
];

export function FundiSafetyPromiseScreen({ navigation }: any): JSX.Element {
  return (
    <View style={styles.outer}>
      <ScreenHeader title="Safety Promise" onBack={() => navigation.goBack()} />

      <InfoPageScreen
        heroIcon="shield-checkmark"
        heroTitle="Our Safety Promise"
        heroSubtitle="Nine layers of protection on every PataFundi job — for you and your customers."
        heroGradient="primary"
        sections={SECTIONS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
