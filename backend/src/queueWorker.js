/**
 * In-process queue worker — processes jobs from `job_queue` table.
 *
 * Uses PostgreSQL `FOR UPDATE SKIP LOCKED` so multiple worker instances
 * can run concurrently without double-claiming a job. A heartbeat plus a
 * fencing token recovers work stranded by a crashed worker without allowing
 * that worker's late completion to overwrite the replacement attempt.
 *
 * Ordinary handler failures are retried up to each row's max_attempts with
 * exponential backoff, then retained as `failed` for authorized operations.
 */

import { query } from './db.js';

const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [60_000, 300_000, 1_800_000]; // 1min, 5min, 30min
const LEASE_HEARTBEAT_MS = 60_000;
const STALE_LEASE_MINUTES = 10;
const RECOVERY_BATCH_SIZE = 100;

/** @type {Map<string, (payload: any) => Promise<void>>} */
const handlers = new Map();

let pollTimer = null;
let processing = false;

export function registerQueueHandler(queueName, handler) {
  handlers.set(queueName, handler);
}

/** Requeue stale leases, or fail them when their bounded attempt budget is spent. */
export async function recoverStaleRunningJobs() {
  const result = await query(
    `with stale as (
       select id, attempts, max_attempts
       from job_queue
       where status = 'running'
         and coalesce(started_at, created_at) < now() - ($1 * interval '1 minute')
       order by coalesce(started_at, created_at)
       limit $2
       for update skip locked
     )
     update job_queue q
     set status = case when stale.attempts >= stale.max_attempts then 'failed' else 'pending' end,
         error_message = case
           when stale.attempts >= stale.max_attempts then 'Worker lease expired; retry limit exhausted'
           else 'Worker lease expired; job returned to retry queue'
         end,
         next_run_at = case
           when stale.attempts >= stale.max_attempts then null
           else now() + (case
             when stale.attempts <= 1 then interval '1 minute'
             when stale.attempts = 2 then interval '5 minutes'
             else interval '30 minutes'
           end)
         end,
         started_at = null,
         lease_token = null,
         completed_at = case when stale.attempts >= stale.max_attempts then now() else null end
     from stale
     where q.id = stale.id
     returning q.id, q.queue_name, q.status, q.attempts, q.max_attempts`,
    [STALE_LEASE_MINUTES, RECOVERY_BATCH_SIZE],
  );

  for (const job of result.rows) {
    if (job.status === 'failed') {
      console.error('[queue] stale lease exhausted retries', {
        jobId: job.id,
        queueName: job.queue_name,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
      });
    } else {
      console.warn('[queue] recovered stale lease', {
        jobId: job.id,
        queueName: job.queue_name,
        attempts: job.attempts,
      });
    }
  }
  return result.rows;
}

async function processOne() {
  // NOTE: job_queue.status CHECK allows ('pending','running','completed',
  // 'failed','dead_letter') — 'processing' would violate the constraint.
  const result = await query(
    `update job_queue
     set status = 'running',
         started_at = now(),
         lease_token = gen_random_uuid(),
         attempts = coalesce(attempts, 0) + 1
     where id = (
       select id from job_queue
       where status = 'pending'
         and (next_run_at is null or next_run_at <= now())
       order by priority desc, created_at
       limit 1
       for update skip locked
     )
     returning id, queue_name, payload, attempts, max_attempts, lease_token`,
    [],
  );
  const job = result.rows[0];
  if (!job) return false;

  const heartbeat = setInterval(() => {
    void query(
      `update job_queue set started_at = now()
       where id = $1 and status = 'running' and lease_token = $2`,
      [job.id, job.lease_token],
    ).catch((error) => {
      console.error('[queue] lease heartbeat failed', {
        jobId: job.id,
        queueName: job.queue_name,
        message: error?.message || 'unknown error',
      });
    });
  }, LEASE_HEARTBEAT_MS);
  if (heartbeat.unref) heartbeat.unref();

  try {
    const handler = handlers.get(job.queue_name);
    if (!handler) {
      await query(
        `update job_queue
         set status = 'failed', error_message = $3, completed_at = now(), lease_token = null
         where id = $1 and status = 'running' and lease_token = $2`,
        [job.id, job.lease_token, 'No handler registered for queue: ' + job.queue_name],
      );
      console.error('[queue] no handler registered', { jobId: job.id, queueName: job.queue_name });
      return true;
    }

    try {
      await handler(job.payload);
      await query(
        `update job_queue
         set status = 'completed', error_message = null, completed_at = now(),
             started_at = null, lease_token = null
         where id = $1 and status = 'running' and lease_token = $2`,
        [job.id, job.lease_token],
      );
    } catch (err) {
      const attempts = job.attempts || 1;
      const maxAttempts = Number(job.max_attempts) || MAX_RETRIES;
      const errorMessage = (err?.message || 'Unknown error').slice(0, 500);
      if (attempts >= maxAttempts) {
        await query(
          `update job_queue
           set status = 'failed', error_message = $3, completed_at = now(),
               started_at = null, lease_token = null
           where id = $1 and status = 'running' and lease_token = $2`,
          [job.id, job.lease_token, errorMessage],
        );
        console.error('[queue] retries exhausted', {
          jobId: job.id,
          queueName: job.queue_name,
          attempts,
          maxAttempts,
          message: errorMessage,
        });
      } else {
        const delay = RETRY_DELAYS[attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await query(
          `update job_queue
           set status = 'pending', error_message = $3,
               next_run_at = now() + ($4 * interval '1 millisecond'),
               started_at = null, lease_token = null
           where id = $1 and status = 'running' and lease_token = $2`,
          [job.id, job.lease_token, errorMessage, delay],
        );
      }
    }
    return true;
  } finally {
    clearInterval(heartbeat);
  }
}

async function tick() {
  if (processing) return;
  processing = true;
  try {
    await recoverStaleRunningJobs();
    // Expire stale quotes (sent/viewed past their expiry): the quote flips to
    // 'expired' and the booking re-opens for other quotes (spec section 5).
    try {
      const { expireStaleQuotes } = await import('./services/quoteService.js');
      await expireStaleQuotes();
    } catch {
      // quote expiry is best-effort; the lazy read path also expires quotes
    }
    // Process up to 10 jobs per tick to avoid hogging the event loop
    for (let i = 0; i < 10; i++) {
      const hadJob = await processOne();
      if (!hadJob) break;
    }
  } catch (err) {
    // Don't let a polling error kill the worker — log and continue
    console.error('[queue] polling/recovery error', err?.message || 'unknown error');
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
