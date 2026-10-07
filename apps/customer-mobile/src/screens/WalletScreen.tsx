import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
} from '@patafundi/shared';
import type { Payment } from '@patafundi/shared';

export function WalletScreen(): JSX.Element {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoadError(false);
      const jobsRes = await apiClient.listJobs({ limit: 50 });
      const jobs = jobsRes?.jobs ?? [];
      // Fetch the real payment record for each booking. Jobs without a
      // payment resolve to null — that is honest data, not an error.
      const settled = await Promise.allSettled(
        jobs.map((j) => apiClient.getPaymentForJob(j.id)),
      );
      const found: Payment[] = [];
      settled.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.payment) found.push(r.value.payment);
      });
      // Most recent first.
      found.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPayments(found);
    } catch {
      // Distinguish "no payments yet" from "could not load" — never fake success.
      setLoadError(true);
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>Wallet</Text>

      <Text style={styles.sectionTitle}>Payment history</Text>
      {loadError ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Payments could not be loaded just now. Pull down to retry.</Text>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No payments yet.</Text>
        </View>
      ) : (
        payments.map((p) => (
          <View key={p.id} style={styles.paymentCard}>
            <View>
              <Text style={styles.paymentAmount}>KES {p.amount}</Text>
              <Text style={styles.paymentMeta}>{p.method.toUpperCase()} · {p.status}</Text>
            </View>
            <Text style={styles.paymentDate}>{new Date(p.createdAt).toLocaleDateString()}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginVertical: spacing.md,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  paymentCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentAmount: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  paymentMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  paymentDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
