/**
 * Central Notification Service (spec §27)
 *
 * Single choke-point for user notifications:
 *   1. in-app row (notifications table) — always
 *   2. realtime socket event to the user's private room — always
 *   3. push (via job_queue worker) — when the user has device tokens
 *   4. email / SMS — env-gated, queued so delivery never blocks the request
 *
 * Controllers should use notify() instead of hand-writing INSERTs so that
 * every channel, dedupe and audit concern lives in exactly one place.
 */
import { query } from '../db.js';
import { emitEvent } from '../realtime.js';
import { isSmsConfigured } from './smsService.js';

const EMAIL_ENABLED = () => Boolean(process.env.RESEND_API_KEY);
// Gate on the SMS service's own capability check so the enqueue gate and the
// queue-worker sender always agree on which env vars configure SMS.
const SMS_ENABLED = () => isSmsConfigured();

async function enqueue(queueName, payload, priority = 5) {
  try {
    await query(
      `insert into job_queue (queue_name, payload, priority, status, scheduled_at)
       values ($1, $2::jsonb, $3, 'pending', now())`,
      [queueName, JSON.stringify(payload), priority],
    );
  } catch (err) {
    console.warn(`[notifications] failed to enqueue ${queueName} (non-blocking):`, err.message);
  }
}

/**
 * notify({ userId, type, title, body, data, channels, push })
 * channels defaults to ['in_app', 'realtime'].
 * Returns the created notification row (or null on failure — never throws).
 */
export async function notify({ userId, type, title, body, data = {}, channels, push = null }) {
  if (!userId) return null;
  const ch = channels || ['in_app', 'realtime'];
  let row = null;
  try {
    if (ch.includes('in_app')) {
      const result = await query(
        `insert into notifications (user_id, type, title, body, data)
         values ($1, $2, $3, $4, $5::jsonb) returning *`,
        [userId, type, title, body, JSON.stringify(data)],
      );
      row = result.rows[0] || null;
    }
    if (ch.includes('realtime')) {
      emitEvent('notification', {
        id: row?.id || null, type, title, body, data, createdAt: new Date().toISOString(),
      }, `user:${userId}`);
    }
    if (ch.includes('push')) {
      await enqueue('push_notification', { userId, type, title, body, data, push }, 4);
    }
    if (ch.includes('email') && EMAIL_ENABLED()) {
      await enqueue('email_notification', { userId, type, title, body, data }, 6);
    }
    if (ch.includes('sms') && SMS_ENABLED()) {
      await enqueue('sms_notification', { userId, type, title, body, data }, 3);
    }
  } catch (err) {
    console.warn('[notifications] notify failed (non-blocking):', err.message);
  }
  return row;
}

/**
 * Notify every active staff/admin account with the given roles.
 * Used for platform-level events (disputes, fraud, verification queue).
 */
export async function notifyRoles(roles, payload) {
  try {
    const result = await query(
      `select id from users where role = any($1::text[]) and status = 'active'`,
      [roles],
    );
    await Promise.all(result.rows.map((u) => notify({ ...payload, userId: u.id })));
    return result.rowCount;
  } catch (err) {
    console.warn('[notifications] notifyRoles failed (non-blocking):', err.message);
    return 0;
  }
}
