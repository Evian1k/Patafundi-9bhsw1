import jwt from 'jsonwebtoken';
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

    socket.on('job:subscribe', ({ jobId }) => {
      if (jobId) socket.join(`job:${jobId}`);
    });
    socket.on('job:unsubscribe', ({ jobId }) => {
      if (jobId) socket.leave(`job:${jobId}`);
    });

    socket.on('chat:typing', ({ jobId, isTyping }) => {
      if (jobId) socket.to(`job:${jobId}`).emit('chat:typing', { jobId, userId: socket.userId, isTyping });
    });

    socket.on('fundi:location:update', (payload) => {
      if (!socket.userId) return;
      if (payload?.jobId) io.to(`job:${payload.jobId}`).emit('fundi:location:update', payload);
    });
  });
}

export function emitEvent(event, payload, room = null) {
  if (!ioRef) return;
  if (room) ioRef.to(room).emit(event, payload);
  else ioRef.emit(event, payload);
}
