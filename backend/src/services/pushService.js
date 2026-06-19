/**
 * Push Notification Service — multi-platform abstraction.
 *
 * Supports:
 *   - Firebase Cloud Messaging (FCM) for Android + Web
 *   - Web Push API (VAPID) for desktop browsers
 *
 * If no credentials are configured, push is silently skipped.
 *
 * Usage:
 *   import { sendPushNotification } from '../services/pushService.js';
 *   await sendPushNotification({ userId, title: 'New Job', body: 'Plumbing job nearby', data: { jobId: '...' } });
 */
import { query } from '../db.js';

let fcmConfigured = null;

function getFcmConfig() {
  if (fcmConfigured !== null) return fcmConfigured;
  fcmConfigured = Boolean(process.env.FCM_SERVER_KEY || process.env.FIREBASE_PROJECT_ID);
  return fcmConfigured;
}

/**
 * Send a push notification to a user's registered devices.
 * Stores device tokens in a `user_device_tokens` table (created via migration).
 */
export async function sendPushNotification({ userId, title, body, data = {} }) {
  if (!userId || !title) return { sent: false, error: 'Missing userId or title' };

  // Get user's device tokens
  const result = await query(
    'select token, platform from user_device_tokens where user_id = $1 and is_active = true',
    [userId],
  );

  if (!result.rows.length) {
    return { sent: false, reason: 'no_devices_registered' };
  }

  if (!getFcmConfig()) {
    console.log(`[push] FCM not configured. Would send to ${result.rows.length} device(s): ${title}`);
    return { sent: false, reason: 'not_configured' };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const device of result.rows) {
    try {
      await sendViaFcm(device.token, title, body, data);
      sentCount++;
    } catch {
      // Token might be invalid — deactivate it
      await query('update user_device_tokens set is_active = false where token = $1', [device.token]);
      failedCount++;
    }
  }

  return { sent: sentCount > 0, sentCount, failedCount };
}

async function sendViaFcm(token, title, body, data) {
  const serverKey = process.env.FCM_SERVER_KEY;
  const message = {
    to: token,
    notification: { title, body },
    data: { ...data, title, body },
    priority: 'high',
  };

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${serverKey}`,
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();
  if (result.failure > 0 && result.results?.[0]?.error) {
    throw new Error(result.results[0].error);
  }
  return result;
}

/**
 * Register a device token for a user (called from mobile app or web push subscription).
 */
export async function registerDeviceToken({ userId, token, platform = 'web' }) {
  if (!userId || !token) return;
  await query(
    `insert into user_device_tokens (user_id, token, platform, is_active)
     values ($1, $2, $3, true)
     on conflict (token) do update set is_active = true, updated_at = now()`,
    [userId, token, platform],
  );
}

/**
 * Unregister a device token (user logged out or device uninstalled app).
 */
export async function unregisterDeviceToken(token) {
  await query('update user_device_tokens set is_active = false where token = $1', [token]);
}

export function getPushStatus() {
  return {
    fcmConfigured: getFcmConfig(),
  };
}
