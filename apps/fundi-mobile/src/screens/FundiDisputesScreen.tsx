import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
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
  ScreenHeader,
} from '@patafundi/shared';
import type { Dispute } from '@patafundi/shared';

const STATUS_COLORS: Record<string, string> = {
  open: colors.warning,
  under_review: colors.info,
  resolved: colors.success,
  rejected: colors.textSecondary,
};

/**
 * Fundi Disputes (spec §37): fundis see disputes on their own jobs and can
 * report problems themselves. The dispute system is shared with customers -
 * both sides are heard before escrow is released or refunded.
 */
export function FundiDisputesScreen({ navigation }: any): JSX.Element {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.listDisputes();
      setDisputes(resp.disputes || []);
    } catch {
      // ignore
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

  const renderItem = ({ item }: { item: Dispute }): JSX.Element => {
    const statusColor = STATUS_COLORS[item.status] ?? colors.textSecondary;
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{String(item.status).replace('_', ' ')}</Text>
          </View>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.reason}>{item.reason}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => navigation.navigate('JobDetail', { jobId: item.jobId })}
        >
          <Text style={styles.viewBtnText}>View Job</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accent} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Disputes" onBack={() => navigation.goBack()} />

      {/* Report entry point - stays inside this flow, never navigates away */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => navigation.navigate('CreateDispute')}
          activeOpacity={0.85}
        >
          <Ionicons name="flag" size={18} color={colors.primaryForeground} />
          <Text style={styles.reportBtnText}>Report a Problem</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.supportBtn}
          onPress={() => navigation.navigate('Support')}
          activeOpacity={0.85}
        >
          <Ionicons name="help-buoy" size={18} color={colors.primary} />
          <Text style={styles.supportBtnText}>Contact Support</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyCard}>
              <Ionicons name="shield-checkmark" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No disputes</Text>
              <Text style={styles.emptyText}>
                Disputes on your jobs will appear here. Escrow protects you while a dispute is open.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 13,
    marginBottom: 8,
  },
  reportBtnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  supportBtnText: {
    color: colors.primary,
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primaryForeground,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  date: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  reason: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  desc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  viewBtnText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
    marginRight: 4,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
