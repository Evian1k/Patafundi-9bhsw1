/**
 * InAppChat — real-time in-app chat overlay for job communication.
 * Used by both Customer (FundiTracker) and Fundi (FundiJob).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { realtimeService } from '@/services/realtime';

interface ChatMessage {
  id?: string;
  sender_id?: string;
  senderId?: string;
  sender_name?: string;
  senderName?: string;
  body?: string;
  content?: string;
  text?: string;
  created_at?: string;
  createdAt?: string;
  timestamp?: string;
}

interface Props {
  jobId: string;
  onClose: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  messages?: Record<string, unknown>[];
  onSend?: (content: string) => void;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function normalizeMessage(msg: ChatMessage, currentUserId?: string) {
  const senderId = msg.sender_id || msg.senderId;
  return {
    id: msg.id,
    senderId,
    senderName: msg.sender_name || msg.senderName,
    content: msg.body || msg.content || msg.text || '',
    timestamp: msg.created_at || msg.createdAt || msg.timestamp,
    isOwn: senderId === currentUserId,
  };
}

export default function InAppChat({ jobId, onClose, currentUserId, currentUserRole, messages: externalMessages, onSend }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => (externalMessages || []).map((m) => normalizeMessage(m as ChatMessage, currentUserId)));
  const [loading, setLoading] = useState(!externalMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async () => {
    if (externalMessages || !jobId) return;
    try {
      const res = await apiClient.getJobMessages(jobId) as { messages?: ChatMessage[] };
      setMessages((res.messages || []).map((m) => normalizeMessage(m, currentUserId)));
      await apiClient.markJobMessagesRead(jobId).catch(() => {});
    } catch (error) {
      console.warn('[chat] Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, externalMessages, jobId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (externalMessages) {
      setMessages(externalMessages.map((m) => normalizeMessage(m as ChatMessage, currentUserId)));
    }
  }, [externalMessages, currentUserId]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token || externalMessages) return;
    realtimeService.connect(token);
    const onMessage = (data: Record<string, unknown>) => {
      if (data.jobId !== jobId) return;
      const message = data.message as ChatMessage | undefined;
      if (!message) return;
      setMessages((prev) => {
        const normalized = normalizeMessage(message, currentUserId);
        if (normalized.id && prev.some((p) => p.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
    };
    realtimeService.on('chat:message', onMessage);
    return () => realtimeService.off('chat:message', onMessage);
  }, [currentUserId, externalMessages, jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    const bypassPatterns = [
      /(?:\+?254|0)?\d{9,12}|(\d{3}[-.]?\d{3}[-.]?\d{4})/,
      /https?:\/\/|www\.|\.com|\.co\.ke|bit\.ly|tinyurl/i,
      /wa\.me|whatsapp|signal|telegram|viber/i,
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
      /\bm-pesa\b|\bmpesa\b|\bdaraja\b|\bpaybill\b/i,
      /\bdirect pay\b|\bpay directly\b|\bskip.*app\b/i,
      /\bcash\b|\bhard cash\b|\bphysical.*money\b/i,
      /\boff.{0,3}platform\b|\bnot.*app\b|\bwithout.*app\b/i,
      /\*\d+\*|USSD|\*150\*|#100#/,
    ];

    if (bypassPatterns.some((pattern) => pattern.test(text))) {
      try {
        await fetch('/api/fraud-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat_bypass_attempt',
            messagePreview: text.substring(0, 100),
            content: text.substring(0, 100),
            userId: currentUserId,
            userRole: currentUserRole,
            jobId,
          }),
        });
      } catch (e) {
        console.warn('[chat] Fraud reporting unavailable:', e);
      }
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          type: 'error',
          message: 'Off-platform contact or payment attempts are not allowed. This has been reported.',
        },
      }));
      return;
    }

    if (onSend) {
      onSend(text);
      setInput('');
      return;
    }

    try {
      const res = await apiClient.sendJobMessage(jobId, text) as { message?: ChatMessage };
      if (res.message) {
        setMessages((prev) => [...prev, normalizeMessage(res.message!, currentUserId)]);
      }
      setInput('');
    } catch (error) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { type: 'error', message: error instanceof Error ? error.message : 'Failed to send message' },
      }));
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
        className="fixed inset-0 z-50 flex flex-col bg-background"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background/95 backdrop-blur-xl shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Job Chat</p>
            <p className="text-xs text-muted-foreground">Communicate with your fundi/customer</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Close chat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center">Loading messages...</p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground text-sm">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start the conversation below</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id || i} className={`flex ${m.isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  m.isOwn ? 'bg-primary text-white rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'
                }`}>
                  {!m.isOwn && m.senderName && (
                    <p className="text-xs font-medium mb-0.5 opacity-70">{m.senderName}</p>
                  )}
                  <p className="text-sm leading-relaxed">{m.content}</p>
                  {m.timestamp && (
                    <p className={`text-xs mt-1 ${m.isOwn ? 'text-white/60' : 'text-muted-foreground'}`}>
                      {formatTime(m.timestamp)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-border bg-background/95 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type a message..."
              className="flex-1 h-11 px-4 bg-muted rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              maxLength={500}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Messages are logged for safety and fraud prevention
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
