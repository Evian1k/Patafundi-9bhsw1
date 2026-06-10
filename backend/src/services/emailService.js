import { Resend } from 'resend';
import { config } from '../config.js';

const OTP_EXPIRY_MINUTES = 10;

let resendClient = null;

function getResendClient() {
  if (!config.resendApiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(config.resendApiKey);
  }
  return resendClient;
}

function otpSubject(purpose) {
  if (purpose === 'password_reset') return 'Reset your PataFundi password';
  return 'Verify your PataFundi account';
}

function otpIntro(purpose) {
  if (purpose === 'password_reset') {
    return 'Use the code below to reset your PataFundi password.';
  }
  return 'Use the code below to verify your PataFundi account.';
}

function buildOtpText({ code, purpose, expiryMinutes }) {
  return [
    'PataFundi',
    '',
    otpIntro(purpose),
    '',
    `Your verification code: ${code}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    'If you did not request this email, you can safely ignore it.',
  ].join('\n');
}

function buildOtpHtml({ code, purpose, expiryMinutes }) {
  const intro = otpIntro(purpose);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${otpSubject(purpose)}</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827;max-width:520px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin:0 0 16px;">PataFundi</h1>
  <p style="margin:0 0 16px;">${intro}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">Your verification code</p>
  <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;">${code}</p>
  <p style="margin:0;font-size:14px;color:#6b7280;">This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
  <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">If you did not request this email, you can safely ignore it.</p>
</body>
</html>`;
}

/**
 * Send a 6-digit OTP email via Resend. Never throws — logs errors and returns status.
 */
export async function sendOtpEmail({ to, code, purpose = 'register' }) {
  const recipient = String(to || '').trim().toLowerCase();
  const otpCode = String(code || '').trim();

  if (!recipient || !otpCode) {
    console.error('[email] Missing recipient or OTP code');
    return { sent: false, reason: 'invalid_payload' };
  }

  const client = getResendClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not configured — OTP not emailed to ${recipient}`);
    return { sent: false, reason: 'not_configured' };
  }

  const subject = otpSubject(purpose);
  const payload = {
    from: config.emailFrom,
    to: [recipient],
    subject,
    html: buildOtpHtml({ code: otpCode, purpose, expiryMinutes: OTP_EXPIRY_MINUTES }),
    text: buildOtpText({ code: otpCode, purpose, expiryMinutes: OTP_EXPIRY_MINUTES }),
  };

  try {
    const result = await client.emails.send(payload);
    if (result.error) {
      console.error('[email] Resend API error:', result.error);
      return { sent: false, reason: result.error.message || 'resend_error' };
    }
    console.log(`[email] OTP sent to ${recipient} (purpose=${purpose}, id=${result.data?.id || 'n/a'})`);
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error('[email] Failed to send OTP email:', err);
    return { sent: false, reason: err?.message || 'send_failed' };
  }
}

export async function sendFraudWarningEmail({ to, subject, body }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient) return { sent: false, reason: 'invalid_payload' };
  const client = getResendClient();
  if (!client) return { sent: false, reason: 'not_configured' };
  try {
    const result = await client.emails.send({
      from: config.emailFrom,
      to: [recipient],
      subject: subject || 'PataFundi Security Notice',
      html: `<p>${body}</p>`,
      text: body,
    });
    if (result.error) return { sent: false, reason: result.error.message };
    return { sent: true, id: result.data?.id };
  } catch (err) {
    return { sent: false, reason: err?.message || 'send_failed' };
  }
}

export { OTP_EXPIRY_MINUTES };
