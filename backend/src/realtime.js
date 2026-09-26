import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { config } from './config.js';

export const realtimeEvents = [
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
  'review:submitted',
  'trust:updated',
  'fundi:location:update',
  'chat:message',
  'chat:read',
  'chat:typing',
];

let ioRef = null;

async function canAccessJobRoom(userId, role, jobId) {
  if (!userId || !jobId) return false;
  if (role === 'admin' || role === 'super_admin') return true;
  const result = await query(
    'select customer_id, fundi_id, company_id, technician_user_id from jobs where id = $1',
    [jobId],
  );
  const job = result.rows[0];
  if (!job) return false;
  if (job.customer_id === userId || job.fundi_id === userId) return true;
  // Assigned company technicians and members of the job's company can follow
  // the job room (tenant-scoped — membership is checked against company_id).
  if (job.technician_user_id === userId) return true;
  if (job.company_id) {
    const member = await query(
      `select 1 from company_members where company_id = $1 and user_id = $2 limit 1`,
      [job.company_id, userId],
    );
    if (member.rows[0]) return true;
  }
  return false;
}

// ── Per-IP connection rate limiting ─────────────────────────────────
// Prevents a single IP from opening hundreds of socket connections
// (DoS mitigation). Max 10 concurrent connections per IP.
const ipConnectionCounts = new Map();
const MAX_CONNECTIONS_PER_IP = 10;
const CONNECTION_WINDOW_MS = 60_000;

function cleanupConnectionCounts() {
  const now = Date.now();
  for (const [ip, entry] of ipConnectionCounts) {
    if (now - entry.firstSeen > CONNECTION_WINDOW_MS) {
      ipConnectionCounts.delete(ip);
    }
  }
}

export function attachRealtime(io) {
  ioRef = io;
  io.use(async (socket, next) => {
    try {
      // ── Connection rate limit per IP ──────────────────────────────
      const ip = socket.handshake.address || 'unknown';
      cleanupConnectionCounts();
      const entry = ipConnectionCounts.get(ip) || { count: 0, firstSeen: Date.now() };
      if (entry.count >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('Too many connections from this IP'));
      }
      entry.count++;
      ipConnectionCounts.set(ip, entry);
      socket.on('disconnect', () => {
        const e = ipConnectionCounts.get(ip);
        if (e) {
          e.count = Math.max(0, e.count - 1);
          if (e.count === 0) ipConnectionCounts.delete(ip);
        }
      });

      // ── JWT auth ──────────────────────────────────────────────────
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token || !config.jwtSecret) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, config.jwtSecret, { issuer: 'patafundi-api', audience: 'patafundi-web', algorithms: ['HS256'] });
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      // Stale-role defense: JWT role stays valid up to the token TTL even after
      // a demotion/suspension. Re-check the live DB role before granting the
      // staff operations room (the HTTP path already does this in authRequired).
      try {
        const { query } = await import('./db.js');
        const live = await query('select role, status from users where id = $1', [payload.sub]);
        const u = live.rows[0];
        if (!u || u.status !== 'active') return next(new Error('Account unavailable'));
        socket.userRole = u.role;
      } catch {
        // DB hiccup: fall back to the verified JWT role rather than locking out realtime
      }
      next();
    } catch {
      next(new Error('Invalid realtime token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);

    // Platform staff join the operations room (payout events, operational
    // alerts). Customer/fundi connections never join this room.
    const STAFF_SOCKET_ROLES = new Set([
      'super_admin', 'admin', 'support_agent', 'fraud_analyst', 'finance_team',
      'dispatch_team', 'devops_engineer', 'auditor', 'ops_manager',
    ]);
    if (socket.userId && STAFF_SOCKET_ROLES.has(socket.userRole)) {
      socket.join('staff:ops');
    }

    socket.on('job:subscribe', async ({ jobId }) => {
      if (!jobId) return;
      const allowed = await canAccessJobRoom(socket.userId, socket.userRole, jobId);
      if (allowed) socket.join(`job:${jobId}`);
    });
    socket.on('job:unsubscribe', ({ jobId }) => {
      if (jobId) socket.leave(`job:${jobId}`);
    });

    socket.on('chat:typing', async ({ jobId, isTyping }) => {
      if (!jobId) return;
      const allowed = await canAccessJobRoom(socket.userId, socket.userRole, jobId);
      if (allowed) socket.to(`job:${jobId}`).emit('chat:typing', { jobId, userId: socket.userId, isTyping });
    });

    socket.on('fundi:location:update', async (payload) => {
      if (!socket.userId || !payload?.jobId) return;
      const job = await query('select fundi_id, technician_user_id, status from jobs where id = $1', [payload.jobId]);
      if (!job.rows[0]) return;
      const isAssignedWorker = job.rows[0].fundi_id === socket.userId || job.rows[0].technician_user_id === socket.userId;
      if (socket.userRole !== 'admin' && socket.userRole !== 'super_admin' && !isAssignedWorker) return;
      if (['completed', 'cancelled', 'failed'].includes(job.rows[0].status)) return;
      io.to(`job:${payload.jobId}`).emit('fundi:location:update', {
        ...payload,
        fundiId: socket.userId,
        recordedAt: new Date().toISOString(),
      });
    });
  });
}

export function emitEvent(event, payload, room = null) {
  if (!ioRef) return;
  if (room) ioRef.to(room).emit(event, payload);
  else ioRef.emit(event, payload);
}
