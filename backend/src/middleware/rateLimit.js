import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
  keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.body?.email || req.path}`,
});

export const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP attempts. Try again later.' },
  keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.body?.email || 'unknown'}`,
});

export const paymentWebhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

export const mapsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Maps API rate limit exceeded.' },
});

// AI assistant endpoints (spec §31-32): generous enough for a booking flow,
// tight enough to make LLM cost abuse impractical.
export const aiRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'AI assistant rate limit reached. Please try again in a few minutes.' },
  keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.user?.id || 'anon'}`,
});

// Public support-ticket endpoint accepts guests, so it needs its own tight
// limiter (spec §71) — the global 120/min alone is far too generous for an
// unauthenticated write endpoint and would allow ticket spam.
export const supportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many support requests submitted. Please try again later.' },
});
