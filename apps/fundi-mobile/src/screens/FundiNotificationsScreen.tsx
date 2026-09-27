import React, { useCallback, useState } from 'react';
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

interface NotificationRow {
  id: string;
  title: string;
  body?: string | null;
  read_at?: string | null;
  created_at?: string;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Fundi notifications (spec §35): booking updates, payments, payouts and
 * dispute news. Polls on focus; tapping an unread row marks it read.
 */
export function FundiNotificationsScreen({ navigation }: any): JSX.Element {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.getNotifications();
      setItems(resp.notifications || []);
    } catch {
      // keep previous list on failure
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

  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async (): Promise<void> => {
    try {
      await apiClient.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {
      // non-fatal
    }
  };

  const markOne = async (id: string): Promise<void> => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)));
    try {
      await apiClient.markNotificationRead(id);
    } catch {
      // next reload re-syncs
    }
  };

  const renderItem = ({ item }: { item: NotificationRow }): JSX.Element => (
    <TouchableOpacity
      style={[styles.row, !item.read_at ? styles.rowUnread : null]}
      onPress={() => !item.read_at && markOne(item.id)}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, !item.read_at ? styles.rowTitleUnread : null]}>{item.title}</Text>
        {item.body ? <Text style={styles.rowBody} numberOfLines={3}>{item.body}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
        {!item.read_at ? <View style={styles.dot} /> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
      {unread > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <TouchableOpacity style={styles.markAllBtn} onPress={markAll} activeOpacity={0.85}>
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={styles.markAllText}>Mark all read ({unread})</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={items}
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
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>
                Job requests, payments and dispute updates will appear here.
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
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  markAllText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowUnread: {
    backgroundColor: `${colors.primary}0D`,
    borderColor: `${colors.primary}55`,
  },
  rowTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  rowBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowTime: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
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
