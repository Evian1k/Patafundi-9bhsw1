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
