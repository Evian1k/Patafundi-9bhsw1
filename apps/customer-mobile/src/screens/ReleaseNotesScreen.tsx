import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  shadows,
} from '@patafundi/shared';

interface ReleasePost {
  id: string;
  title?: string;
  version?: string;
  publishedAt?: string;
  createdAt?: string;
  excerpt?: string;
  summary?: string;
  content?: string;
  changes?: string[];
  tags?: string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; posts: ReleasePost[] };

const FALLBACK_MSG = 'Failed to load release notes';

function extractBullets(post: ReleasePost): string[] {
  if (Array.isArray(post.changes) && post.changes.length > 0) return post.changes;
  const source = post.excerpt ?? post.summary ?? post.content ?? '';
  if (!source) return [];
  return source
    .split(/\n|•|\u2022|\r/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 240);
}

function formatVersion(post: ReleasePost): string {
  if (post.version) return post.version.startsWith('v') ? post.version : `v${post.version}`;
  const titleMatch = (post.title ?? '').match(/v?\d+\.\d+(?:\.\d+)?/);
  return titleMatch ? (titleMatch[0].startsWith('v') ? titleMatch[0] : `v${titleMatch[0]}`) : 'Update';
}

function formatDate(post: ReleasePost): string {
  const dateStr = post.publishedAt ?? post.createdAt;
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ReleaseNotesScreen(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });
    try {
      const resp = await apiClient.listBlogPosts();
      const posts: ReleasePost[] = Array.isArray(resp.posts) ? resp.posts : [];
      // Prefer posts tagged 'updates'; fall back to all so the screen is never empty.
      const filtered = posts.filter((p) => {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        return tags.some((t) => String(t).toLowerCase() === 'updates');
      });
      const finalList = filtered.length > 0 ? filtered : posts;
      finalList.sort((a, b) => {
        const ad = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
        const bd = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
        return bd - ad;
      });
      setState({ status: 'ready', posts: finalList });
    } catch (e) {
      const msg = e instanceof Error ? e.message : FALLBACK_MSG;
      setState({ status: 'error', message: msg });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggle = (id: string): void => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.center, { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.errorCircle}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
        </View>
        <Text style={styles.errorTitle}>Couldn't load updates</Text>
        <Text style={styles.errorText}>{state.message}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.85}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (state.posts.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.center, { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.errorCircle}>
          <Ionicons name="newspaper-outline" size={40} color={colors.textSecondary} />
        </View>
        <Text style={styles.errorTitle}>No updates yet</Text>
        <Text style={styles.errorText}>When we ship new versions, you'll see them here.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {state.posts.map((post) => {
        const id = post.id ?? `${post.title ?? ''}-${post.createdAt ?? ''}`;
        const isOpen = !!expanded[id];
        const bullets = extractBullets(post);
        const version = formatVersion(post);
        const date = formatDate(post);
        const title = post.title ?? 'App Update';
        return (
          <View key={id} style={styles.postCard}>
            <TouchableOpacity
              style={styles.postHeader}
              onPress={() => toggle(id)}
              activeOpacity={0.7}
            >
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>{version}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postTitle}>{title}</Text>
                {date ? <Text style={styles.postDate}>{date}</Text> : null}
              </View>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {isOpen ? (
              <View style={styles.postBody}>
                {bullets.length > 0 ? (
                  bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{b}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.fallbackText}>
                    {post.excerpt ?? post.summary ?? post.content ?? 'No details available.'}
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorCircle: {
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
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  retryText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
  postCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  versionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primaryLight,
  },
  versionText: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
  postTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  postDate: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  postBody: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  fallbackText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
