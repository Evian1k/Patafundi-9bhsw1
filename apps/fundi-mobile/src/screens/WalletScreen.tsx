import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  type WalletBalance,
  type WalletTransaction,
} from '@patafundi/shared';

interface AnalyticsData {
  weekly?: Array<{ label?: string; amount?: number }>;
  weeklyEarnings?: Array<{ label?: string; amount?: number }>;
  daily?: Array<{ label?: string; amount?: number }>;
  monthlyTotal?: number;
  weeklyTotal?: number;
  total?: number;
}

export function WalletScreen({ navigation }: any): JSX.Element {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        apiClient.getWalletBalance(),
        apiClient.getWalletTransactions(),
        apiClient.getEarningsAnalytics(),
      ]);
      if (results[0].status === 'fulfilled') setBalance(results[0].value.balance);
      if (results[1].status === 'fulfilled') setTransactions(results[1].value.transactions || []);
      if (results[2].status === 'fulfilled') setAnalytics(results[2].value.analytics as AnalyticsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  const bars: Array<{ label: string; amount: number }> = (() => {
    const source = analytics?.weekly || analytics?.weeklyEarnings || analytics?.daily || [];
    const list = source
      .map((d) => ({ label: d.label ?? '', amount: typeof d.amount === 'number' ? d.amount : 0 }))
      .filter((d) => d.label);
    if (list.length > 0) return list.slice(0, 7);
    // Fallback empty bars so chart still renders
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => ({ label, amount: 0 }));
  })();
  const maxBar = Math.max(...bars.map((b) => b.amount), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>Wallet</Text>

      <LinearGradient
        colors={[gradients.primary.start, gradients.primary.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>KES {balance?.available ?? 0}</Text>
        <Text style={styles.pendingText}>Pending: KES {balance?.pending ?? 0}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('RequestPayout')}
          activeOpacity={0.85}
          style={styles.withdrawWrap}
        >
          <LinearGradient
            colors={[gradients.accent.start, gradients.accent.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.withdrawBtn}
          >
            <Ionicons name="cash-outline" size={18} color={colors.accentForeground} />
            <Text style={styles.withdrawText}>Withdraw</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Earnings (this week)</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.barRow}>
          {bars.map((b, i) => {
            const heightPct = (b.amount / maxBar) * 100;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.bar, { height: `${Math.max(heightPct, 4)}%` }]}
                  />
                </View>
                <Text style={styles.barLabel}>{b.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Weekly total</Text>
          <Text style={styles.totalValue}>KES {analytics?.weeklyTotal ?? analytics?.total ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Transactions</Text>
      {transactions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No transactions yet.</Text>
        </View>
      ) : (
        transactions.map((t) => (
          <View key={t.id} style={styles.txCard}>
            <View style={styles.txIconWrap}>
              <Ionicons
                name={t.type === 'credit' || t.type === 'commission' ? 'arrow-down-circle' : 'arrow-up-circle'}
                size={20}
                color={t.type === 'credit' || t.type === 'commission' ? colors.success : colors.error}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.txDesc}>{t.description}</Text>
              <Text style={styles.txMeta}>
                {t.type.toUpperCase()} · {t.status}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  styles.txAmount,
                  { color: t.type === 'credit' || t.type === 'commission' ? colors.success : colors.text },
                ]}
              >
                {t.type === 'credit' || t.type === 'commission' ? '+' : '-'} KES {t.amount}
              </Text>
              <Text style={styles.txDate}>{new Date(t.createdAt).toLocaleDateString()}</Text>
            </View>
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
  balanceCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  balanceLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
    opacity: 0.9,
  },
  balanceValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.title,
    color: colors.primaryForeground,
    marginTop: 4,
  },
  pendingText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.primaryForeground,
    opacity: 0.85,
    marginTop: 4,
  },
  withdrawWrap: {
    marginTop: spacing.md,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
  },
  withdrawText: {
    color: colors.accentForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    marginLeft: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingHorizontal: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barTrack: {
    width: '100%',
    height: 110,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    minHeight: 4,
  },
  barLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  totalValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
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
  txCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  txDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  txMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  txAmount: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  txDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
