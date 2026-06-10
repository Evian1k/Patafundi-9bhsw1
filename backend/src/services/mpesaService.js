import crypto from 'node:crypto';
import { config, requireConfig } from '../config.js';

function requireMpesaConfig() {
  requireConfig(config.mpesa.consumerKey, 'MPESA_CONSUMER_KEY');
  requireConfig(config.mpesa.consumerSecret, 'MPESA_CONSUMER_SECRET');
  requireConfig(config.mpesa.shortcode, 'MPESA_SHORTCODE');
  requireConfig(config.mpesa.passkey, 'MPESA_PASSKEY');
  requireConfig(config.mpesa.callbackUrl, 'MPESA_CALLBACK_URL');
}

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  return digits;
}

export function assertValidMpesaPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!/^254(7|1)\d{8}$/.test(normalized)) {
    const error = new Error('Valid Kenyan M-Pesa number is required');
    error.status = 400;
    throw error;
  }
  return normalized;
}

export async function getAccessToken() {
  requireMpesaConfig();
  const credentials = Buffer.from(`${config.mpesa.consumerKey}:${config.mpesa.consumerSecret}`).toString('base64');
  const response = await fetch(`${config.mpesa.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!response.ok) throw new Error(`Daraja token request failed with ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

export async function initiateStkPush({ phone, amount, accountReference, transactionDesc }) {
  const accessToken = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const password = Buffer.from(`${config.mpesa.shortcode}${config.mpesa.passkey}${timestamp}`).toString('base64');
  const response = await fetch(`${config.mpesa.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: config.mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(Number(amount)),
      PartyA: normalizePhone(phone),
      PartyB: config.mpesa.shortcode,
      PhoneNumber: normalizePhone(phone),
      CallBackURL: config.mpesa.callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ResponseCode !== '0') {
    const error = new Error(data.errorMessage || data.ResponseDescription || 'Daraja STK push failed');
    error.status = 502;
    error.meta = data;
    throw error;
  }
  return data;
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = config.mpesa.consumerSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function verifyCallbackSecret(req) {
  if (!config.mpesa.callbackSecret) {
    return config.nodeEnv !== 'production';
  }
  const provided = req.get('x-mpesa-callback-secret') || req.body?.callbackSecret;
  if (!provided) return false;
  const expectedBuffer = Buffer.from(config.mpesa.callbackSecret);
  const providedBuffer = Buffer.from(String(provided));
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function requireCallbackSecretInProduction() {
  if (config.nodeEnv === 'production' && !config.mpesa.callbackSecret) {
    throw new Error('MPESA_CALLBACK_SECRET is required in production');
  }
}
