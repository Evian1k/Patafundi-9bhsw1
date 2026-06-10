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
  if (role === 'admin') return true;
  const result = await query(
    'select customer_id, fundi_id from jobs where id = $1',
    [jobId],
  );
  const job = result.rows[0];
  if (!job) return false;
  return job.customer_id === userId || job.fundi_id === userId;
}

export function attachRealtime(io) {
  ioRef = io;
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token || !config.jwtSecret) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, config.jwtSecret, { issuer: 'patafundi-api', audience: 'patafundi-web' });
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      next();
    } catch {
      next(new Error('Invalid realtime token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);

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
      const job = await query('select fundi_id, status from jobs where id = $1', [payload.jobId]);
      if (!job.rows[0]) return;
      if (socket.userRole !== 'admin' && job.rows[0].fundi_id !== socket.userId) return;
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
