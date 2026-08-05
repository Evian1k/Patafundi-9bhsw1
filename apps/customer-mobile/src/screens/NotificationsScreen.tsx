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
import type { Notification } from '@patafundi/shared';

export function NotificationsScreen({ navigation }: any): JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [tappingId, setTappingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.getNotifications();
      setNotifications(resp.notifications || []);
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

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkAll = async (): Promise<void> => {
    setMarking(true);
    try {
      await apiClient.markAllNotificationsRead();
      await load();
    } catch {
      // ignore
    } finally {
      setMarking(false);
    }
  };

  const handleTap = async (item: Notification): Promise<void> => {
    const targetJobId = item.jobId ?? null;
    if (!item.isRead) {
      setTappingId(item.id);
      try {
        await apiClient.markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
      } catch {
        // ignore — still allow navigation
      } finally {
        setTappingId(null);
      }
    }
    if (targetJobId) {
      navigation?.navigate?.('JobTracking', { jobId: targetJobId });
    }
  };

  const renderItem = ({ item }: { item: Notification }): JSX.Element => (
    <TouchableOpacity
      style={[styles.card, item.isRead ? styles.cardRead : null]}
      onPress={() => void handleTap(item)}
      disabled={tappingId === item.id}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, item.isRead ? null : styles.iconWrapUnread]}>
        <Ionicons name="notifications" size={18} color={item.isRead ? colors.textSecondary : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.message}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      {!item.isRead ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleMarkAll}
          disabled={marking || notifications.length === 0}
          style={styles.markBtn}
        >
          {marking ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.markText}>Mark all read</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
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
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  markBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  markText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRead: {
    opacity: 0.7,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: colors.primaryLight,
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  date: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
});
