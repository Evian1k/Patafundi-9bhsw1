/**
 * Real-time Socket Service (Socket.IO)
 * Production-hardened: graceful degradation, no duplicate sockets,
 * correct event names aligned with backend, clean teardown.
 */

import { io, Socket } from 'socket.io-client';
import { env, isSocketConfigured } from '@/config/env';

class RealtimeService {
  socket: Socket | null = null;
  token: string | null = null;
  listeners: Map<string, Set<Function>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private locationWatchActive = false;

  connect(token: string) {
    if (this.socket?.connected && this.token === token) return;

    if (this.socket) {
      this.socket.offAny();
      this.socket.disconnect();
      this.socket = null;
    }

    if (!isSocketConfigured()) {
      console.warn('[realtime] VITE_SOCKET_URL is not set — real-time features disabled.');
      return;
    }

    this.token = token;
    this.socket = io(env.SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: 15,
      transports: ['websocket', 'polling'],
      timeout: 20_000,
    });

    this.socket.on('connect', () => {
      console.log('[realtime] Connected:', this.socket!.id);
      this.socket!.emit('auth:token', token);
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    });

    this.socket.on('auth:ok', () => {
      console.log('[realtime] Authenticated');
    });

    this.socket.on('auth:failed', (data: unknown) => {
      console.error('[realtime] Auth failed:', data);
      this.disconnect();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('[realtime] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err: Error) => {
      console.warn('[realtime] Connection error:', err.message);
    });

    this.socket.on('reconnect', () => {
      console.log('[realtime] Reconnected — re-authenticating');
      if (this.token) this.socket!.emit('auth:token', this.token);
    });

    this.socket.onAny((event: string, ...args: unknown[]) => {
      this._emit(event, ...args);
    });
  }

  disconnect() {
    if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    if (this.socket) {
      this.socket.offAny();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean { return this.socket?.connected ?? false; }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  offAll(event: string) { this.listeners.delete(event); }

  private _emit(event: string, ...args: unknown[]) {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    for (const cb of cbs) {
      try { cb(...args); } catch (err) {
        console.error(`[realtime] Listener error on "${event}":`, err);
      }
    }
  }

  send(event: string, data?: unknown) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[realtime] Cannot send — socket not connected:', event);
    }
  }

  // ── Fundi helpers ────────────────────────────────────────────────────────
  updateLocation(latitude: number, longitude: number, accuracy?: number, online?: boolean) {
    this.send('fundi:location:update', { latitude, longitude, accuracy, online });
  }

  respondToJobRequest(jobId: string, accept: boolean) {
    this.send('fundi:response', { jobId, accept });
  }

  sendMessage(jobId: string, content: string) {
    this.send('chat:send', { jobId, content });
  }

  /** Subscribe to fundi location updates for a specific job */
  onFundiLocation(jobId: string, callback: (loc: { latitude: number; longitude: number; accuracy?: number }) => void) {
    const handler = (payload: Record<string, unknown>) => {
      if (payload?.jobId && payload.jobId !== jobId) return;
      const lat = Number(payload?.latitude);
      const lng = Number(payload?.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        callback({ latitude: lat, longitude: lng, accuracy: payload?.accuracy as number | undefined });
      }
    };
    this.on('fundi:location:update', handler);
    return () => this.off('fundi:location:update', handler);
  }

  /** Emit payout request from fundi wallet */
  requestPayout(amount: number, mpesaNumber: string) {
    this.send('payout:request', { amount, mpesaNumber });
  }
}

export const realtimeService = new RealtimeService();
