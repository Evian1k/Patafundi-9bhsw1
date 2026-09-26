-- Migration 026: Add risk_score to image_moderation_queue + queue worker support
-- Adds the risk_score column used by the new automated pre-screening logic
-- in enterpriseService3.js submitImageForModeration().

ALTER TABLE image_moderation_queue
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_img_mod_risk_score
  ON image_moderation_queue(risk_score DESC)
  WHERE status = 'pending';

-- Add error_message column to job_queue if it doesn't exist (queue worker uses it)
ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_queue_next_run
  ON job_queue(next_run_at)
  WHERE status = 'pending';
