import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NotificationRow {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  read_at?: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Notifications history (spec §35) — deep-linkable, full list with mark-read.
 * The bell dropdown shows the recent slice; this page is the complete record.
 */
export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setItems(null);
    try {
      const res = await apiClient.getNotifications() as { notifications?: NotificationRow[] };
      setItems(Array.isArray(res?.notifications) ? res.notifications : []);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unread = (items || []).filter((n) => !n.read_at).length;

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await apiClient.markAllNotificationsRead();
      setItems((prev) => (prev || []).map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark notifications read. Try again.");
    } finally {
      setMarkingAll(false);
    }
  };

  const markOne = async (id: string) => {
    setItems((prev) => (prev || []).map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)));
    try {
      await apiClient.markNotificationRead(id);
    } catch {
      // Revert on failure is unnecessary UX noise for a read receipt; next
      // reload re-syncs from the server.
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Go back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You are all caught up"}
            </p>
          </div>
          <button onClick={load} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAll} disabled={markingAll}>
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {error ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-destructive mb-3">Could not load notifications.</p>
            <Button variant="outline" onClick={load}>Try again</Button>
          </div>
        ) : items === null ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Bell className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-semibold">No notifications yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Booking updates, payments and replies will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden divide-y divide-border/40">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.read_at && markOne(n.id)}
                className={cn(
                  "w-full text-left px-4 py-3.5 transition-colors",
                  !n.read_at ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={cn("text-sm", !n.read_at ? "font-semibold" : "font-medium")}>{n.title}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                {n.body && <p className="text-xs text-muted-foreground mt-1">{n.body}</p>}
                {!n.read_at && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-1.5" aria-label="Unread" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
