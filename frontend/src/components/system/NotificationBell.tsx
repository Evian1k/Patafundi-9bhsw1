/**
 * NotificationBell — role-agnostic notification center (spec §4/§11).
 *
 * Reads the caller's OWN notifications from /notifications (server scopes by
 * user_id — customer notifications never leak into staff feeds and vice versa).
 * Polls every 30s and refetches on window focus; marks items read in place.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at?: string;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getNotifications() as { notifications?: NotificationRow[] };
      setItems(Array.isArray(res?.notifications) ? res.notifications : []);
      setLoaded(true);
    } catch {
      // Not authenticated or offline — the bell simply stays quiet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAll = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {
      // non-blocking
    }
  };

  return (
    <div className={cn("relative", className)} ref={panelRef}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!loaded) load();
        }}
        aria-label="Notifications"
        className="relative p-2 rounded-xl hover:bg-muted transition-colors text-foreground"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/60 bg-card shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <p className="font-semibold text-sm">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && !loaded && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {loaded && items.length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No notifications yet.
              </div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "px-4 py-3 border-b border-border/30 last:border-0",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-sm", !n.read_at ? "font-semibold" : "font-medium")}>{n.title}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {timeAgo(n.created_at || "")}
                  </span>
                </div>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.body}</p>}
              </div>
            ))}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-xs font-medium text-primary border-t border-border/50 hover:bg-primary/5 transition-colors"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
