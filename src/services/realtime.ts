/**
 * PataFundi realtime service.
 *
 * Uses Socket.IO in production when VITE_SOCKET_URL is configured. A polling
 * watcher remains as a resilience fallback for status/payment changes.
 */

import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';

type EventPayload = Record<string, unknown>;
type EventCallback = (data: EventPayload) => void;

const TRACKING_EVENTS = [
  'job:created',
  'job:accepted',
  'job:request:declined',
  'job:search:failed',
  'job:started',
  'job:completed',
  'job:cancelled',
  'job:status',
  'payment:initiated',
  'payment:confirmed',
  'payment:failed',
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

class RealtimeService {
  private listeners: Map<string, EventCallback[]> = new Map();
  private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private socket: Socket | null = null;
  private token: string | null = null;
  private isConnected = false;

  connect(token: string): void {
    this.token = token;

    if (!env.SOCKET_URL) {
      this.isConnected = true;
      console.info('[Realtime] Socket URL not configured; using polling fallback');
      return;
    }

    if (this.socket?.connected) return;

    this.socket = io(env.SOCKET_URL, {
      auth: { token },
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

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.info('[Realtime] Socket.IO disconnected');
    });

    TRACKING_EVENTS.forEach((event) => {
      this.socket?.off(event);
      this.socket?.on(event, (data: EventPayload) => this.emitLocal(event, data || {}));
    });
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

  watchJob(jobId: string, apiBaseUrl: string): void {
    this.socket?.emit('job:subscribe', { jobId });
    if (this.pollIntervals.has(`job:${jobId}`)) return;

    let lastStatus: string | null = null;
    let lastPaymentStatus: string | null = null;

    const poll = async () => {
      if (!this.token) return;
      try {
        const [jobRes, payRes] = await Promise.all([
          fetch(`${apiBaseUrl}/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${this.token}` },
          }).then((response) => response.json()).catch(() => null),
          fetch(`${apiBaseUrl}/payments/job/${jobId}`, {
            headers: { Authorization: `Bearer ${this.token}` },
          }).then((response) => response.json()).catch(() => null),
        ]);

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

  get connected(): boolean {
    return this.isConnected;
  }
}

export const realtimeService = new RealtimeService();
