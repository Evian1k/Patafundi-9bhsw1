/**
 * InAppChat — real-time in-app chat overlay for job communication.
 * Used by both Customer (FundiTracker) and Fundi (FundiJob).
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle } from 'lucide-react';

interface Message {
  id?: string;
  senderId?: string;
  senderName?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  createdAt?: string;
  isOwn?: boolean;
}

interface Props {
  jobId: string;
  messages: Record<string, unknown>[];
  onSend: (content: string) => void;
  onClose: () => void;
  currentUserId?: string;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function InAppChat({ messages, onSend, onClose, currentUserId }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
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
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background/95 backdrop-blur-xl shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Job Chat</p>
            <p className="text-xs text-muted-foreground">Communicate with your fundi/customer</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-xl transition-colors"
            aria-label="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground text-sm">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start the conversation below</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const m = msg as Message;
              const content = m.content || m.text || '';
              const timestamp = m.timestamp || m.createdAt;
              const isOwn = m.isOwn || m.senderId === currentUserId;

              return (
                <div key={m.id || i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  }`}>
                    {!isOwn && m.senderName && (
                      <p className="text-xs font-medium mb-0.5 opacity-70">{m.senderName}</p>
                    )}
                    <p className="text-sm leading-relaxed">{content}</p>
                    {timestamp && (
                      <p className={`text-xs mt-1 ${isOwn ? 'text-white/60' : 'text-muted-foreground'}`}>
                        {formatTime(timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
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
            Messages are end-to-end logged for safety
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
