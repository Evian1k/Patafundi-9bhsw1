import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../apiClient';
import { colors, fonts, fontSize, spacing, borderRadius } from '../theme';
import { ScreenHeader } from '../components/ScreenHeader';

interface PolicyData {
  title?: string;
  content?: string;
  version?: string;
  updatedAt?: string;
}

export function LegalPageScreen({ route, navigation }: any): JSX.Element {
  const slug: string = route?.params?.slug ?? '';
  const routeTitle: string = route?.params?.title ?? 'Legal';
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.getPolicy(slug);
      setPolicy((resp.policy as PolicyData) ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load policy';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
        </View>
        <Text style={styles.errorTitle}>Couldn't load content</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity onPress={load} activeOpacity={0.85} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const title = policy?.title ?? routeTitle;
  const content = policy?.content ?? '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <ScreenHeader title={routeTitle} onBack={() => navigation.goBack()} />

      <Text style={styles.title}>{title}</Text>
      <View style={styles.metaRow}>
        {policy?.version ? (
          <View style={styles.metaChip}>
            <Ionicons name="document-text-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>v{policy.version}</Text>
          </View>
        ) : null}
        {policy?.updatedAt ? (
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>{new Date(policy.updatedAt).toLocaleDateString()}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.content}>{content}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorIcon: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  errorMsg: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  retryText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.pill,
  },
  metaText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  content: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: 24,
    color: colors.text,
  },
});
