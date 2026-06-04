/**
 * PataFundi Realtime Service
 * 
 * OnSpace Cloud does not support Socket.IO.
 * This service uses polling + event emitter pattern to maintain
 * interface compatibility with the existing codebase.
 */

type EventCallback = (data: Record<string, unknown>) => void;

class RealtimeService {
  private listeners: Map<string, EventCallback[]> = new Map();
  private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private currentJobId: string | null = null;
  private _token: string | null = null;
  private isConnected = false;

  connect(token: string): void {
    this._token = token;
    this.isConnected = true;
    console.info('[Realtime] Connected via polling mode');
  }

  disconnect(): void {
    this._token = null;
    this.isConnected = false;
    this.stopAllPolling();
    console.info('[Realtime] Disconnected');
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const cbs = this.listeners.get(event) || [];
    this.listeners.set(event, cbs.filter((cb) => cb !== callback));
  }

  emit(event: string, data: Record<string, unknown>): void {
    const cbs = this.listeners.get(event) || [];
    cbs.forEach((cb) => {
      try { cb(data); } catch (e) { console.error(`[Realtime] Error in ${event} handler:`, e); }
    });
  }

  /**
   * Poll a job's status and emit socket-compatible events when status changes.
   */
  watchJob(jobId: string, apiBaseUrl: string): void {
    if (this.pollIntervals.has(`job:${jobId}`)) return;
    this.currentJobId = jobId;
    let lastStatus: string | null = null;
    let lastPaymentStatus: string | null = null;

    const poll = async () => {
      if (!this._token) return;
      try {
        const [jobRes, payRes] = await Promise.all([
          fetch(`${apiBaseUrl}/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${this._token}` },
          }).then((r) => r.json()).catch(() => null),
          fetch(`${apiBaseUrl}/payments/job/${jobId}`, {
            headers: { Authorization: `Bearer ${this._token}` },
          }).then((r) => r.json()).catch(() => null),
        ]);

        const job = jobRes?.job;
        const payment = payRes?.payment;

        if (job) {
          // Emit status changes
          if (lastStatus !== null && lastStatus !== job.status) {
            const eventMap: Record<string, string> = {
              accepted: 'job:accepted',
              on_the_way: 'job:status',
              arrived: 'job:status',
              in_progress: 'job:status',
              completed: 'job:completed',
              cancelled: 'job:cancelled',
              failed: 'job:search:failed',
            };
            const evt = eventMap[job.status];
            if (evt) {
              this.emit(evt, {
                jobId,
                status: job.status,
                estimatedPrice: job.estimated_price,
                fundiId: job.fundi_id,
              });
            }
          }
          lastStatus = job.status;
        }

        // Emit payment events
        if (payment) {
          const pStatus = payment.status?.toLowerCase();
          if (lastPaymentStatus !== pStatus) {
            if (pStatus === 'completed' || pStatus === 'confirmed') {
              this.emit('payment:confirmed', { jobId, payment });
            } else if (pStatus === 'failed') {
              this.emit('payment:failed', { jobId, message: payment.failure_reason });
            }
            lastPaymentStatus = pStatus;
          }
        }
      } catch (e) {
        console.warn('[Realtime] Poll error:', e);
      }
    };

    const interval = setInterval(poll, 4000);
    this.pollIntervals.set(`job:${jobId}`, interval);
    // Initial poll
    poll();
  }

  stopWatchingJob(jobId: string): void {
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

  /** Compatibility shim — does nothing but avoids errors */
  updateLocation(lat: number, lon: number, accuracy?: number, online?: boolean): void {
    // Location updates go through REST API, not realtime
    console.debug('[Realtime] updateLocation:', lat, lon, accuracy, online);
  }

  get connected(): boolean {
    return this.isConnected;
  }
}

export const realtimeService = new RealtimeService();
