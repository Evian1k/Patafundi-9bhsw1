import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
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
  SERVICE_CATEGORIES,
} from '@patafundi/shared';
import type { FundiPublic } from '@patafundi/shared';

const CATEGORY_LABELS: Record<string, string> = SERVICE_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.slug] = cat.label;
    return acc;
  },
  {} as Record<string, string>,
);

function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function FavoritesScreen({ navigation }: any): JSX.Element {
  const [favorites, setFavorites] = useState<FundiPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.listFavoriteFundis();
      setFavorites(resp.favorites ?? []);
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

  const handleRemove = (fundi: FundiPublic): void => {
    Alert.alert(
      'Remove favorite',
      `Remove ${fundi.fullName} from your favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(fundi.id);
            try {
              await apiClient.removeFavoriteFundi(fundi.id);
              setFavorites((prev) => prev.filter((f) => f.id !== fundi.id));
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to remove favorite';
              Alert.alert('Failed', msg);
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  };

  const handleBook = (fundi: FundiPublic): void => {
    const parent = navigation.getParent();
    parent?.navigate('HomeTab', {
      screen: 'CreateJob',
      params: { category: fundi.serviceCategory },
    });
  };

  const renderItem = ({ item }: { item: FundiPublic }): JSX.Element => {
    const initial = (item.fullName?.trim()?.[0] ?? 'F').toUpperCase();
    const isRemoving = removingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.fullName}</Text>
              {item.verified ? (
                <Ionicons name="shield-checkmark" size={14} color={colors.success} />
              ) : null}
            </View>
            <Text style={styles.category}>{categoryLabel(item.serviceCategory)}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={styles.metaText}>{item.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="shield-outline" size={12} color={colors.accent} />
                <Text style={styles.metaText}>{item.trustScore}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="briefcase-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.metaText}>{item.completedJobs}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => handleBook(item)}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primaryForeground} />
            <Text style={styles.bookText}>Book</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item)}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Favorites</Text>
        <Text style={styles.subtitle}>{favorites.length} saved fundis</Text>
      </View>
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <View style={styles.emptyCircle}>
              <Ionicons name="heart-outline" size={48} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>No favorite fundis yet</Text>
            <Text style={styles.emptyText}>
              Book a service and save your preferred professionals.
            </Text>
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
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xl,
    color: colors.primaryForeground,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flex: 1,
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  category: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.pill,
  },
  metaText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  bookBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
  },
  bookText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
  removeBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.error + '40',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  emptyCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
