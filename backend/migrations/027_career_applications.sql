-- Migration 027: Career applications table
-- Replaces the stub /careers/apply endpoint with a real implementation

CREATE TABLE IF NOT EXISTS career_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES career_jobs(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  cover_letter text,
  resume_url text,
  linkedin_url text,
  portfolio_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_apps_status ON career_applications(status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_apps_email ON career_applications(email);
CREATE INDEX IF NOT EXISTS idx_career_apps_job ON career_applications(job_id);
