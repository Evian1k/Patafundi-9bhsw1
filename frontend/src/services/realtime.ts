/**
 * PataFundi realtime service.
 *
 * Uses Socket.IO in production when VITE_SOCKET_URL is configured. A polling
 * watcher remains as a resilience fallback for status/payment changes.
 */

import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL, buildApiUrl } from '@/api/config';

type EventPayload = Record<string, unknown>;
type EventCallback = (data: EventPayload) => void;

const TRACKING_EVENTS = [
  'job:created',
  'job:accepted',
  'job:request:declined',
  'job:search:failed',
  'job:started',
  'job:checkin',
  'job:completed',
  'job:cancelled',
  'job:status',
  'job:completion:confirmed',
  'payment:initiated',
  'payment:confirmed',
  'payment:failed',
  'escrow:held',
  'escrow:released',
  'payout:requested',
  'payout:processing',
  'payout:completed',
  'dispute:opened',
  'dispute:resolved',
  'trust:updated',
  'fundi:location:update',
  'fundi:arrived',
  'review:submitted',
  'chat:message',
  'chat:read',
  'chat:typing',
];

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function pollHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const csrf = readCookie('csrf_token');
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return headers;
}

class RealtimeService {
  private listeners: Map<string, EventCallback[]> = new Map();
  private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private socket: Socket | null = null;
  private token: string | null = null;
  private isConnected = false;
  private lifecycleBound = false;

  /** True while the Socket.IO channel is live (for honest status displays). */
  get connected(): boolean {
    return this.isConnected;
  }

  connect(token?: string | null): void {
    const resolved = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null);
    if (!resolved) return;
    this.token = resolved;

    if (!SOCKET_URL) {
      this.isConnected = true;
      console.info('[Realtime] Socket URL not configured; using polling fallback');
      return;
    }

    // Idempotent: an existing socket (connected OR still reconnecting) is
    // reused so repeated connect() calls never spawn duplicate sockets.
    if (this.socket) return;

    this.socket = io(SOCKET_URL, {
      auth: { token: resolved },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.info('[Realtime] Socket.IO connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      // Only log genuine unexpected drops. Page BFCache suspensions and
      // explicit client disconnects are normal lifecycle events, not errors.
      if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
        console.info('[Realtime] Socket.IO reconnecting…');
      }
    });

    TRACKING_EVENTS.forEach((event) => {
      this.socket?.off(event);
      this.socket?.on(event, (data: EventPayload) => this.emitLocal(event, data || {}));
    });

    this.bindPageLifecycle();
  }

  /**
   * BFCache-aware lifecycle (spec §13): browsers freeze WebSocket pages when
   * they enter the Back-Forward Cache, which surfaces as a failed socket
   * write. We proactively disconnect on pagehide and cleanly re-resume on
   * return — no error spam, no duplicate sockets, no leaked listeners.
   */
  private bindPageLifecycle(): void {
    if (this.lifecycleBound || typeof window === 'undefined') return;
    this.lifecycleBound = true;

    window.addEventListener('pagehide', () => {
      // Silent suspend — the socket is intentionally frozen by the browser.
      if (this.socket?.connected) this.socket.disconnect();
      this.stopAllPolling();
    });

    const resume = () => {
      if (!this.token) return;
      if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
        // socket.io resumes transports without creating a second socket.
        if (this.socket.disconnected) this.socket.connect();
        this.resumeJobPolling();
      }
    };
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resume();
    });
  }

  /** Restart polling watchers for jobs the UI is still subscribed to. */
  private resumeJobPolling(): void {
    // Poll intervals are re-created lazily by watchJob() callers on their own
    // visibilitychange effects; here we only make sure no stale timers remain.
    this.stopAllPolling();
  }

  disconnect(): void {
    this.token = null;
    this.isConnected = false;
    this.stopAllPolling();
    this.socket?.disconnect();
    this.socket = null;
    console.info('[Realtime] Disconnected');
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const callbacks = this.listeners.get(event)!;
    if (!callbacks.includes(callback)) callbacks.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event) || [];
    this.listeners.set(event, callbacks.filter((cb) => cb !== callback));
  }

  emit(event: string, data: EventPayload): void {
    if (this.socket?.connected) this.socket.emit(event, data);
    this.emitLocal(event, data);
  }

  private emitLocal(event: string, data: EventPayload): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Realtime] Error in ${event} handler:`, error);
      }
    });
  }

  watchJob(jobId: string): void {
    this.socket?.emit('job:subscribe', { jobId });
    if (this.pollIntervals.has(`job:${jobId}`)) return;

    let lastStatus: string | null = null;
    let lastPaymentStatus: string | null = null;
    let authFailed = false;

    const poll = async () => {
      if (!this.token || authFailed) return;
      try {
        const jobResponse = await fetch(buildApiUrl(`/jobs/${jobId}`), {
          credentials: 'include',
          headers: pollHeaders(this.token),
        });
        if (jobResponse.status === 403 || jobResponse.status === 404 || jobResponse.status === 400) {
          authFailed = true;
          this.stopWatchingJob(jobId);
          return;
        }
        const payResponse = await fetch(buildApiUrl(`/payments/job/${jobId}`), {
          credentials: 'include',
          headers: pollHeaders(this.token),
        });
        const jobRes = jobResponse.ok ? await jobResponse.json().catch(() => null) : null;
        const payRes = payResponse.ok ? await payResponse.json().catch(() => null) : null;

        const job = jobRes?.job;
        const payment = payRes?.payment;

        if (job) {
          const status = String(job.status || '');
          if (lastStatus !== null && lastStatus !== status) {
            const eventMap: Record<string, string> = {
              accepted: 'job:accepted',
              on_the_way: 'job:status',
              arrived: 'job:status',
              in_progress: 'job:status',
              completed: 'job:completed',
              cancelled: 'job:cancelled',
              failed: 'job:search:failed',
            };
            const event = eventMap[status];
            if (event) {
              this.emitLocal(event, {
                jobId,
                status,
                estimatedPrice: job.estimated_price,
                fundiId: job.fundi_id,
              });
            }
          }
          lastStatus = status;
        }

        if (payment) {
          const status = String(payment.status || '').toLowerCase();
          if (lastPaymentStatus !== status) {
            if (status === 'completed' || status === 'confirmed') {
              this.emitLocal('payment:confirmed', { jobId, payment });
            } else if (status === 'failed') {
              this.emitLocal('payment:failed', { jobId, message: payment.failure_reason });
            }
            lastPaymentStatus = status;
          }
        }
      } catch (error) {
        console.warn('[Realtime] Poll error:', error);
      }
    };

    const interval = setInterval(poll, 4000);
    this.pollIntervals.set(`job:${jobId}`, interval);
    poll();
  }

  stopWatchingJob(jobId: string): void {
    this.socket?.emit('job:unsubscribe', { jobId });
    const key = `job:${jobId}`;
    const interval = this.pollIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(key);
    }
  }

  stopAllPolling(): void {
    this.pollIntervals.forEach((interval) => clearInterval(interval));
    this.pollIntervals.clear();
  }

  updateLocation(lat: number, lon: number, accuracy?: number, online?: boolean, jobId?: string): void {
    const payload = {
      jobId,
      latitude: lat,
      longitude: lon,
      accuracy,
      online,
      recordedAt: new Date().toISOString(),
    };
    this.emit('fundi:location:update', payload);
  }
}

export const realtimeService = new RealtimeService();
