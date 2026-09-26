/**
 * In-process queue worker — processes jobs from `job_queue` table.
 *
 * Uses PostgreSQL `FOR UPDATE SKIP LOCKED` so multiple worker instances
 * can run concurrently without double-processing. No Redis required.
 *
 * The worker polls every 5 seconds for new jobs. Each queue name has a
 * registered handler. Jobs that fail are retried up to 3 times with
 * exponential backoff, then marked as 'failed'.
 */

import { query } from './db.js';

const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [60_000, 300_000, 1_800_000]; // 1min, 5min, 30min

/** @type {Map<string, (payload: any) => Promise<void>>} */
const handlers = new Map();

let pollTimer = null;
let processing = false;

export function registerQueueHandler(queueName, handler) {
  handlers.set(queueName, handler);
}

async function processOne() {
  const result = await query(
    `update job_queue
     set status = 'processing',
         started_at = now(),
         attempts = coalesce(attempts, 0) + 1
     where id = (
       select id from job_queue
       where status = 'pending'
         and (next_run_at is null or next_run_at <= now())
       order by priority desc, created_at
       for update skip locked
       limit 1
     )
     returning id, queue_name, payload, attempts`,
    [],
  );
  const job = result.rows[0];
  if (!job) return false;

  const handler = handlers.get(job.queue_name);
  if (!handler) {
    await query(
      `update job_queue set status = 'failed', error_message = $2, completed_at = now() where id = $1`,
      [job.id, 'No handler registered for queue: ' + job.queue_name],
    );
    return true;
  }

  try {
    await handler(job.payload);
    await query(
      `update job_queue set status = 'completed', error_message = null, completed_at = now() where id = $1`,
      [job.id],
    );
  } catch (err) {
    const attempts = job.attempts || 1;
    if (attempts >= MAX_RETRIES) {
      await query(
        `update job_queue set status = 'failed', error_message = $2, completed_at = now() where id = $1`,
        [job.id, (err.message || 'Unknown error').slice(0, 500)],
      );
    } else {
      const delay = RETRY_DELAYS[attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      await query(
        `update job_queue set status = 'pending', error_message = $2, next_run_at = now() + ($3 * interval '1 millisecond') where id = $1`,
        [job.id, (err.message || 'Unknown error').slice(0, 500), delay],
      );
    }
  }
  return true;
}

async function tick() {
  if (processing) return;
  processing = true;
  try {
    // Process up to 10 jobs per tick to avoid hogging the event loop
    for (let i = 0; i < 10; i++) {
      const hadJob = await processOne();
      if (!hadJob) break;
    }
  } catch (err) {
    // Don't let a polling error kill the worker — log and continue
  } finally {
    processing = false;
  }
}

export function startQueueWorker() {
  if (pollTimer) return;
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  // Don't keep the process alive just for the worker
  if (pollTimer.unref) pollTimer.unref();
  // Run one tick immediately on startup (after a short delay to let the server bind)
  setTimeout(tick, 3000);
}

export function stopQueueWorker() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
