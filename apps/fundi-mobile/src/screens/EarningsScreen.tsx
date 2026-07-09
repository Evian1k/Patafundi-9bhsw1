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

interface BarItem {
  label: string;
  amount: number;
}

interface AnalyticsData {
  weeklyTotal?: number;
  monthlyTotal?: number;
  yearlyTotal?: number;
  total?: number;
  weekly?: Array<{ label?: string; amount?: number }>;
  weeklyEarnings?: Array<{ label?: string; amount?: number }>;
  daily?: Array<{ label?: string; amount?: number }>;
  byCategory?: Record<string, number>;
  categoryBreakdown?: Record<string, number>;
  topCustomers?: Array<{ name?: string; total?: number; count?: number }>;
}

export function EarningsScreen({ navigation }: any): JSX.Element {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const data = await apiClient.getEarningsAnalytics();
      setAnalytics((data.analytics as AnalyticsData) ?? null);
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

  const bars: BarItem[] = (() => {
    const source = analytics?.weekly || analytics?.weeklyEarnings || analytics?.daily || [];
    const list = source
      .map((d) => ({ label: d.label ?? '', amount: typeof d.amount === 'number' ? d.amount : 0 }))
      .filter((d) => d.label);
    if (list.length > 0) return list.slice(0, 7);
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => ({ label, amount: 0 }));
  })();
  const maxBar = Math.max(...bars.map((b) => b.amount), 1);

  const categoryMap: Record<string, number> = analytics?.byCategory || analytics?.categoryBreakdown || {};
  const categories = Object.entries(categoryMap).map(([label, amount]) => ({ label, amount }));
  const maxCategory = Math.max(...categories.map((c) => c.amount), 1);

  const topCustomers = (analytics?.topCustomers ?? []).slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Earnings'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.title}>Earnings</Text>

      <View style={styles.periodRow}>
        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>This Week</Text>
          <Text style={styles.periodValue}>KES {analytics?.weeklyTotal ?? 0}</Text>
        </View>
        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>This Month</Text>
          <Text style={styles.periodValue}>KES {analytics?.monthlyTotal ?? 0}</Text>
        </View>
        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>This Year</Text>
          <Text style={styles.periodValue}>KES {analytics?.yearlyTotal ?? analytics?.total ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Weekly earnings</Text>
      <View style={styles.card}>
        <View style={styles.barRow}>
          {bars.map((b, i) => {
            const heightPct = (b.amount / maxBar) * 100;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${Math.max(heightPct, 4)}%` }]} />
                </View>
                <Text style={styles.barLabel}>{b.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {categories.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>By category</Text>
          <View style={styles.card}>
            {categories.map((c) => {
              const widthPct = (c.amount / maxCategory) * 100;
              return (
                <View key={c.label} style={styles.catRow}>
                  <Text style={styles.catLabel} numberOfLines={1}>{c.label}</Text>
                  <View style={styles.catBarTrack}>
                    <View style={[styles.catBar, { width: `${Math.max(widthPct, 6)}%` }]} />
                  </View>
                  <Text style={styles.catValue}>KES {c.amount}</Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {topCustomers.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Top customers</Text>
          <View style={styles.card}>
            {topCustomers.map((c, i) => (
              <View key={i} style={styles.customerRow}>
                <View style={styles.customerRank}>
                  <Text style={styles.customerRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{c.name ?? 'Customer'}</Text>
                  {typeof c.count === 'number' ? (
                    <Text style={styles.customerMeta}>{c.count} job{c.count === 1 ? '' : 's'}</Text>
                  ) : null}
                </View>
                <Text style={styles.customerTotal}>KES {c.total ?? 0}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
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
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  periodCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  periodValue: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
    marginTop: 4,
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
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  catLabel: {
    flex: 0,
    width: 100,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    textTransform: 'capitalize',
  },
  catBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.pill,
    overflow: 'hidden',
  },
  catBar: {
    height: '100%',
    borderRadius: borderRadius.pill,
    backgroundColor: colors.accent,
  },
  catValue: {
    flex: 0,
    width: 80,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: 'right',
    fontWeight: '600',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  customerRank: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerRankText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  customerName: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
  },
  customerMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customerTotal: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.success,
  },
});
