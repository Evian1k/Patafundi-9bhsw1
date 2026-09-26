export const SOCKET_EVENTS = {
  JOB_CREATED: 'job:created', JOB_ACCEPTED: 'job:accepted', JOB_REQUEST_DECLINED: 'job:request:declined',
  JOB_SEARCH_FAILED: 'job:search:failed', JOB_STARTED: 'job:started', JOB_CHECKIN: 'job:checkin',
  JOB_COMPLETED: 'job:completed', JOB_CANCELLED: 'job:cancelled', JOB_STATUS: 'job:status',
  JOB_COMPLETION_CONFIRMED: 'job:completion:confirmed',
  PAYMENT_INITIATED: 'payment:initiated', PAYMENT_CONFIRMED: 'payment:confirmed', PAYMENT_FAILED: 'payment:failed',
  ESCROW_HELD: 'escrow:held', ESCROW_RELEASED: 'escrow:released',
  PAYOUT_REQUESTED: 'payout:requested', PAYOUT_PROCESSING: 'payout:processing', PAYOUT_COMPLETED: 'payout:completed',
  DISPUTE_OPENED: 'dispute:opened', DISPUTE_RESOLVED: 'dispute:resolved',
  REVIEW_SUBMITTED: 'review:submitted', TRUST_UPDATED: 'trust:updated',
  FUNDI_LOCATION_UPDATE: 'fundi:location:update', CHAT_MESSAGE: 'chat:message', CHAT_READ: 'chat:read', CHAT_TYPING: 'chat:typing',
} as const;

export const CLIENT_EVENTS = {
  JOB_SUBSCRIBE: 'job:subscribe', JOB_UNSUBSCRIBE: 'job:unsubscribe',
  CHAT_TYPING: 'chat:typing', FUNDI_LOCATION_UPDATE: 'fundi:location:update',
} as const;
