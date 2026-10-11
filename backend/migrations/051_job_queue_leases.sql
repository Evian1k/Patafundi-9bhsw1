-- Fencing token for each queue claim. If a worker crashes or its lease is
-- reaped, a late result from the old worker cannot overwrite the new attempt.
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS lease_token uuid;
