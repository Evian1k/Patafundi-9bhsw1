-- Distinguish provider-confirmed funds that could not be applied to their job.
-- This is not a refund or a failed provider charge; it requires finance review.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'pending', 'completed', 'failed', 'cancelled', 'refunded', 'reconciliation_required'
));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_amount numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_payments_job_active_status
  ON payments (job_id, status, created_at)
  WHERE status IN ('pending', 'completed', 'reconciliation_required');
