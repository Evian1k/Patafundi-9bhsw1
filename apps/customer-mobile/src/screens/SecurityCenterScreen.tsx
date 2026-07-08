import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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

interface Session {
  id: string;
  deviceName?: string;
  device?: string;
  location?: string;
  ipAddress?: string;
  lastActive?: string;
  current?: boolean;
  platform?: string;
}

interface LoginHistoryItem {
  id: string;
  createdAt?: string;
  ipAddress?: string;
  device?: string;
  location?: string;
  success?: boolean;
  status?: string;
}

type SectionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

export function SecurityCenterScreen(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [sessionsState, setSessionsState] = useState<SectionState>({ status: 'loading' });
  const [historyState, setHistoryState] = useState<SectionState>({ status: 'loading' });
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);
  const [requestingExport, setRequestingExport] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);

  const loadSessions = useCallback(async (): Promise<void> => {
    setSessionsState({ status: 'loading' });
    try {
      const resp = await apiClient.getActiveSessions();
      setSessions(resp.sessions ?? []);
      setSessionsState({ status: 'ready' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      setSessionsState({ status: 'error', message: msg });
    }
  }, []);

  const loadHistory = useCallback(async (): Promise<void> => {
    setHistoryState({ status: 'loading' });
    try {
      const resp = await apiClient.getLoginHistory();
      setHistory(resp.history ?? []);
      setHistoryState({ status: 'ready' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load login history';
      setHistoryState({ status: 'error', message: msg });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
      void loadHistory();
    }, [loadSessions, loadHistory]),
  );

  useEffect(() => {
    void loadSessions();
    void loadHistory();
  }, [loadSessions, loadHistory]);

  const handleTerminate = (session: Session): void => {
    Alert.alert(
      'Terminate session',
      `Sign out ${session.deviceName ?? 'this device'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate',
          style: 'destructive',
          onPress: async () => {
            setTerminatingId(session.id);
            try {
              await apiClient.terminateSession(session.id);
              setSessions((prev) => prev.filter((s) => s.id !== session.id));
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to terminate session';
              Alert.alert('Failed', msg);
            } finally {
              setTerminatingId(null);
            }
          },
        },
      ],
    );
  };

  const handleTerminateAll = (): void => {
    Alert.alert(
      'Terminate all sessions',
      'This will sign out every device except the current one. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate All',
          style: 'destructive',
          onPress: async () => {
            setTerminatingAll(true);
            try {
              await apiClient.terminateAllSessions();
              await loadSessions();
              Alert.alert('Done', 'All other sessions terminated.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to terminate sessions';
              Alert.alert('Failed', msg);
            } finally {
              setTerminatingAll(false);
            }
          },
        },
      ],
    );
  };

  const handleExport = async (): Promise<void> => {
    setRequestingExport(true);
    try {
      await apiClient.requestDataExport();
      Alert.alert(
        'Request received',
        "You'll receive an email with a download link for your data within 72 hours.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to request data export';
      Alert.alert('Failed', msg);
    } finally {
      setRequestingExport(false);
    }
  };

  const handleDeletion = (): void => {
    Alert.alert(
      'Delete my account',
      'This will permanently delete your account and all associated data after a 30-day grace period. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: async () => {
            setRequestingDeletion(true);
            try {
              await apiClient.requestDataDeletion();
              Alert.alert(
                'Request received',
                'Your account deletion has been scheduled. You will receive a confirmation email shortly.',
              );
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to request deletion';
              Alert.alert('Failed', msg);
            } finally {
              setRequestingDeletion(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
    >
      <Text style={styles.sectionTitle}>Active Sessions</Text>
      {sessionsState.status === 'loading' ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : sessionsState.status === 'error' ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
          <Text style={styles.errorText}>{sessionsState.message}</Text>
          <TouchableOpacity onPress={loadSessions}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="phone-portrait-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No active sessions.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {sessions.map((s) => (
            <View key={s.id} style={styles.sessionCard}>
              <View style={styles.sessionIconWrap}>
                <Ionicons name="hardware-chip-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.sessionTitleRow}>
                  <Text style={styles.sessionDevice}>
                    {s.deviceName ?? s.device ?? 'Unknown device'}
                  </Text>
                  {s.current ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  ) : null}
                </View>
                {s.location ? (
                  <Text style={styles.sessionMeta}>
                    <Ionicons name="location-outline" size={11} color={colors.textSecondary} /> {s.location}
                  </Text>
                ) : null}
                {s.ipAddress ? (
                  <Text style={styles.sessionMeta}>IP: {s.ipAddress}</Text>
                ) : null}
                {s.lastActive ? (
                  <Text style={styles.sessionMeta}>
                    Last active {new Date(s.lastActive).toLocaleString()}
                  </Text>
                ) : null}
              </View>
              {!s.current ? (
                <TouchableOpacity
                  style={styles.terminateBtn}
                  onPress={() => handleTerminate(s)}
                  disabled={terminatingId === s.id}
                >
                  {terminatingId === s.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={styles.terminateBtnText}>Terminate</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            style={[styles.dangerOutlineBtn, { opacity: terminatingAll ? 0.5 : 1 }]}
            onPress={handleTerminateAll}
            disabled={terminatingAll}
          >
            {terminatingAll ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.dangerOutlineText}>Terminate All Other Sessions</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Login History</Text>
      {historyState.status === 'loading' ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : historyState.status === 'error' ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
          <Text style={styles.errorText}>{historyState.message}</Text>
          <TouchableOpacity onPress={loadHistory}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No login history yet.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {history.map((item) => {
            const isSuccess = item.success !== false && item.status !== 'failed';
            return (
              <View key={item.id} style={styles.historyCard}>
                <View
                  style={[
                    styles.historyIconWrap,
                    { backgroundColor: (isSuccess ? colors.success : colors.error) + '20' },
                  ]}
                >
                  <Ionicons
                    name={isSuccess ? 'checkmark-outline' : 'close-outline'}
                    size={16}
                    color={isSuccess ? colors.success : colors.error}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDevice}>
                    {item.device ?? 'Unknown device'}
                  </Text>
                  {item.location ? (
                    <Text style={styles.historyMeta}>{item.location}</Text>
                  ) : null}
                  <Text style={styles.historyMeta}>
                    {item.ipAddress ? `IP ${item.ipAddress} · ` : ''}
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.historyStatus,
                    { backgroundColor: (isSuccess ? colors.success : colors.error) + '20' },
                  ]}
                >
                  <Text
                    style={[styles.historyStatusText, { color: isSuccess ? colors.success : colors.error }]}
                  >
                    {isSuccess ? 'Success' : 'Failed'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>Data Privacy</Text>
      <View style={styles.cardList}>
        <TouchableOpacity
          style={styles.privacyCard}
          onPress={handleExport}
          disabled={requestingExport}
          activeOpacity={0.7}
        >
          <View style={styles.privacyIconWrap}>
            <Ionicons name="download-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Download my data</Text>
            <Text style={styles.privacyDesc}>
              Request a full export of your account data (GDPR).
            </Text>
          </View>
          {requestingExport ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.privacyCard}
          onPress={handleDeletion}
          disabled={requestingDeletion}
          activeOpacity={0.7}
        >
          <View style={[styles.privacyIconWrap, { backgroundColor: colors.error + '20' }]}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.privacyTitle, { color: colors.error }]}>Delete my account</Text>
            <Text style={styles.privacyDesc}>
              Permanently remove your account and data.
            </Text>
          </View>
          {requestingDeletion ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  loadingRow: {
    padding: spacing.md,
    alignItems: 'center',
  },
  cardList: {
    gap: 8,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDevice: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.accent + '20',
    borderRadius: borderRadius.pill,
  },
  currentBadgeText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.accent,
  },
  sessionMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  terminateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.error + '40',
  },
  terminateBtnText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.xs,
    color: colors.error,
  },
  dangerOutlineBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.error,
    marginTop: spacing.sm,
  },
  dangerOutlineText: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.error,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDevice: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
    color: colors.text,
  },
  historyMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.pill,
  },
  historyStatusText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentLighter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitle: {
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  privacyDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexWrap: 'wrap',
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  retryLink: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
});
