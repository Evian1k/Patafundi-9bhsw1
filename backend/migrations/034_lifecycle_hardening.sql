-- 034_lifecycle_hardening.sql
-- Job lifecycle hardening (spec §17): add the 'expired' failure state so the
-- expiry reaper can retire unmatched requests, plus a partial index for the
-- reaper's scan. Jobs that are scheduled never expire (they park as 'scheduled').

-- 1) Extend the jobs.status CHECK with 'expired'
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN (
  'pending', 'matching', 'offered', 'accepted', 'assigned', 'scheduled',
  'on_the_way', 'arrived', 'in_progress', 'completion_requested',
  'completed', 'cancelled', 'failed', 'expired'
));

-- 2) Reaper scan index: only unresolved, unassigned requests
CREATE INDEX IF NOT EXISTS idx_jobs_expiry_scan
  ON jobs (created_at)
  WHERE status IN ('pending', 'matching', 'offered');

-- 3) Offer responsiveness index: offers waiting for accept/decline
CREATE INDEX IF NOT EXISTS idx_jobs_offered_updated
  ON jobs (updated_at)
  WHERE status = 'offered';
