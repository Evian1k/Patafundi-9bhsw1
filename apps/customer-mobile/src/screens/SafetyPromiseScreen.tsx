import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
} from '@patafundi/shared';
import { InfoPageScreen, InfoSection } from '../components/InfoPageScreen';

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
    body: "Track your fundi's arrival in real-time. You'll always know who is coming and when.",
    color: '#06B6D4',
  },
  {
    icon: 'lock-closed',
    title: 'Secure Payments',
    body: 'Payments are held in escrow until work is completed to your satisfaction.',
    color: '#27A35F',
  },
  {
    icon: 'people',
    title: 'Dispute Resolution',
    body: 'File a dispute if something goes wrong — we mediate fairly and quickly.',
    color: '#F59E0B',
  },
  {
    icon: 'warning',
    title: 'Emergency Support',
    body: 'SOS button connects you to support instantly during any active job.',
    color: '#EF4444',
  },
  {
    icon: 'lock-closed',
    title: 'Privacy Protection',
    body: 'Your data is encrypted in transit and at rest, and never shared without your consent.',
    color: '#8B5CF6',
  },
];

export function SafetyPromiseScreen({ navigation }: any): JSX.Element {
  return (
    <View style={styles.outer}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Safety Promise'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <InfoPageScreen
        heroIcon="shield-checkmark"
        heroTitle="Our Safety Promise"
        heroSubtitle="Nine layers of protection on every PataFundi job."
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
});
