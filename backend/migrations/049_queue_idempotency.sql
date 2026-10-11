-- Add an optional idempotency key to the existing PostgreSQL-backed job queue.
-- Existing rows are preserved (NULL keys are not constrained by the index).
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_idempotency_key
  ON job_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
