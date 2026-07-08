import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  type Message,
} from '@patafundi/shared';
import { useAuthStore } from '../store/authStore';

export function JobChatScreen({ route }: any): JSX.Element {
  const jobId: string = route?.params?.jobId;
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.getJobMessages(jobId);
      setMessages(resp.messages || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadMessages();
    const unsubscribe = apiClient.subscribeToJob(jobId, {
      onMessage: () => {
        void loadMessages();
      },
    });
    pollRef.current = setInterval(() => {
      void loadMessages();
    }, 5000);
    return () => {
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, loadMessages]);

  const handleSend = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setText('');
    try {
      await apiClient.sendMessage(jobId, trimmed);
      await loadMessages();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send';
      setText(trimmed);
      // eslint-disable-next-line no-alert
      alert(msg);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }): JSX.Element => {
    const mine = item.senderId === user?.id;
    if (item.type === 'system') {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : null]}>
        {mine ? (
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleMine}
          >
            <Text style={styles.bubbleTextMine}>{item.text}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.bubbleOther}>
            {item.senderName ? <Text style={styles.senderName}>{item.senderName}</Text> : null}
            <Text style={styles.bubbleTextOther}>{item.text}</Text>
          </View>
        )}
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet. Say hello to your customer.</Text>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          multiline
        />
        <TouchableOpacity onPress={handleSend} disabled={sending || !text.trim()} activeOpacity={0.85}>
          <LinearGradient
            colors={[gradients.primary.start, gradients.primary.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.sendBtn, !text.trim() || sending ? styles.sendBtnDisabled : null]}
          >
            {sending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.primaryForeground} />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  systemText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.pill,
  },
  bubbleWrap: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  bubbleWrapMine: {
    alignItems: 'flex-end',
  },
  bubbleMine: {
    maxWidth: '78%',
    borderRadius: borderRadius.lg,
    padding: 12,
    borderBottomRightRadius: 4,
  },
  bubbleTextMine: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.primaryForeground,
  },
  bubbleOther: {
    maxWidth: '78%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: 12,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 2,
  },
  bubbleTextOther: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.background,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
});
