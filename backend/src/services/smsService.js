/**
 * SMS Service — multi-provider abstraction.
 *
 * Supports:
 *   - Africa's Talking (Kenya standard)
 *   - Twilio (international)
 *
 * Provider is selected via SMS_PROVIDER env var.
 * If no provider is configured, SMS is silently skipped (returns { sent: false }).
 *
 * Usage:
 *   import { sendSms } from '../services/smsService.js';
 *   await sendSms({ to: '254712345678', message: 'Your OTP is 123456' });
 */
import crypto from 'node:crypto';

const PROVIDERS = {
  africas_talking: 'africas_talking',
  twilio: 'twilio',
};

function getProvider() {
  return process.env.SMS_PROVIDER || '';
}

function isConfigured() {
  const provider = getProvider();
  if (provider === PROVIDERS.africas_talking) {
    return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
  }
  if (provider === PROVIDERS.twilio) {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  }
  return false;
}

/**
 * Send an SMS message.
 * @param {Object} params - { to, message }
 * @returns {Promise<{ sent: boolean, provider?: string, messageId?: string, error?: string }>}
 */
export async function sendSms({ to, message }) {
  if (!to || !message) return { sent: false, error: 'Missing to or message' };

  const provider = getProvider();
  if (!provider || !isConfigured()) {
    // SMS not configured — log and return (don't crash the caller)
    console.log(`[sms] Not configured. Would send to ${to}: ${message.slice(0, 50)}...`);
    return { sent: false, reason: 'not_configured' };
  }

  const normalizedPhone = normalizePhone(to);

  try {
    if (provider === PROVIDERS.africas_talking) {
      return await sendViaAfricasTalking(normalizedPhone, message);
    }
    if (provider === PROVIDERS.twilio) {
      return await sendViaTwilio(normalizedPhone, message);
    }
    return { sent: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    console.error('[sms] Send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send OTP via SMS (convenience method).
 */
export async function sendOtpSms({ to, code, purpose = 'register' }) {
  const message = purpose === 'password_reset'
    ? `Your PataFundi password reset code is ${code}. Expires in 10 minutes.`
    : `Your PataFundi verification code is ${code}. Expires in 10 minutes.`;
  return sendSms({ to, message });
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  return digits;
}

// ── Africa's Talking ──
async function sendViaAfricasTalking(phone, message) {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  const senderId = process.env.AT_SENDER_ID || 'PATAFUNDI';

  const body = new URLSearchParams({
    username,
    to: phone,
    message,
    from: senderId,
  });

  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey': apiKey,
    },
    body: body.toString(),
  });

  const data = await response.json();
  if (data.SMSMessageData?.MessageSent?.length > 0) {
    return { sent: true, provider: 'africas_talking', messageId: data.SMSMessageData.MessageSent[0].messageId };
  }
  return { sent: false, error: data.SMSMessageData?.Message || 'Unknown error' };
}

// ── Twilio ──
async function sendViaTwilio(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    To: `+${phone}`,
    From: fromNumber,
    Body: message,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
    body: body.toString(),
  });

  const data = await response.json();
  if (data.sid) {
    return { sent: true, provider: 'twilio', messageId: data.sid };
  }
  return { sent: false, error: data.message || 'Unknown error' };
}

export function getSmsStatus() {
  return {
    provider: getProvider() || 'none',
    configured: isConfigured(),
  };
}
