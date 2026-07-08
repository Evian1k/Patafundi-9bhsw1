import React from 'react';
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

export function SafetyPromiseScreen(): JSX.Element {
  return (
    <InfoPageScreen
      heroIcon="shield-checkmark"
      heroTitle="Our Safety Promise"
      heroSubtitle="Nine layers of protection on every PataFundi job."
      heroGradient="primary"
      sections={SECTIONS}
    />
  );
}
