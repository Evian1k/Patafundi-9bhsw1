import { config } from '../config.js';

/**
 * Stripe card payments (spec §26-27): M-Pesa first, cards where supported.
 *
 * The integration is env-gated: with STRIPE_SECRET_KEY present, payment
 * intents are created through Stripe's REST API (no SDK dependency, works on
 * Render free tier). Without it, the service reports `configured: false` and
 * callers return an honest "cards not enabled yet" response — never a mock
 * success. Payment lifecycle: intent (authorization) -> capture -> refund,
 * mirroring the M-Pesa STK push -> confirmation -> refund flow.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export function stripeStatus() {
  return {
    configured: Boolean(config.stripe?.secretKey),
    currency: 'KES',
    mode: config.stripe?.secretKey?.startsWith('sk_test') ? 'test' : 'live',
  };
}

function encodeAuth(key) {
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

/**
 * Create a PaymentIntent for a booking. Amount is server-computed — the
 * client only ever receives intent ids/client secrets, never sets amounts.
 * Returns { ok, intentId, clientSecret, status } or { ok: false, error }.
 */
export async function createPaymentIntent({ amount, currency = 'kes', metadata = {} }) {
  if (!config.stripe?.secretKey) {
    return { ok: false, error: 'Card payments are not enabled yet. Use M-Pesa.', code: 'not_configured' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Invalid amount', code: 'invalid_amount' };
  }
  const body = new URLSearchParams({
    amount: String(Math.round(amount * 100)), // KES is a zero-decimal-adjacent currency; Stripe expects minor units
    currency: currency.toLowerCase(),
    'automatic_payment_methods[enabled]': 'true',
    ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, String(v).slice(0, 400)])),
  });
  try {
    const resp = await fetch(`${STRIPE_API}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: encodeAuth(config.stripe.secretKey),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: data.error?.message || 'Stripe payment intent failed', code: data.error?.code || 'stripe_error' };
    }
    return { ok: true, intentId: data.id, clientSecret: data.client_secret, status: data.status };
  } catch (err) {
    return { ok: false, error: err.message, code: 'network' };
  }
}

/**
 * Capture a previously-authorized intent (manual capture flows) or refund a
 * captured one. amount is optional — full capture/refund when omitted.
 */
export async function capturePaymentIntent(intentId, amount = null) {
  if (!config.stripe?.secretKey) return { ok: false, error: 'Card payments are not enabled yet', code: 'not_configured' };
  const body = new URLSearchParams();
  if (amount != null) body.set('amount_to_capture', String(Math.round(Number(amount) * 100)));
  try {
    const resp = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(intentId)}/capture`, {
      method: 'POST',
      headers: { Authorization: encodeAuth(config.stripe.secretKey), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();
    if (!resp.ok) return { ok: false, error: data.error?.message || 'Stripe capture failed', code: data.error?.code || 'stripe_error' };
    return { ok: true, status: data.status, amountCaptured: (data.amount_received || 0) / 100 };
  } catch (err) {
    return { ok: false, error: err.message, code: 'network' };
  }
}

export async function refundPaymentIntent(intentId, amount = null, reason = 'requested_by_customer') {
  if (!config.stripe?.secretKey) return { ok: false, error: 'Card payments are not enabled yet', code: 'not_configured' };
  const body = new URLSearchParams({ payment_intent: intentId, reason });
  if (amount != null) body.set('amount', String(Math.round(Number(amount) * 100)));
  try {
    const resp = await fetch(`${STRIPE_API}/refunds`, {
      method: 'POST',
      headers: { Authorization: encodeAuth(config.stripe.secretKey), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();
    if (!resp.ok) return { ok: false, error: data.error?.message || 'Stripe refund failed', code: data.error?.code || 'stripe_error' };
    return { ok: true, refundId: data.id, status: data.status, amountRefunded: (data.amount || 0) / 100 };
  } catch (err) {
    return { ok: false, error: err.message, code: 'network' };
  }
}
