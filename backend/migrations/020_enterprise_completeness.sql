-- ============================================================
-- Migration 020: Enterprise Completeness — DR, Productivity, Messaging, GDPR
-- ============================================================

-- ── 1. Backup logs (Disaster Recovery) ────────────────────────
CREATE TABLE IF NOT EXISTS backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL CHECK (backup_type IN ('full', 'incremental')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  backup_size_bytes bigint,
  storage_location text,
  checksum text,
  started_at timestamptz,
  completed_at timestamptz,
  initiated_by uuid REFERENCES users(id),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_logs_created ON backup_logs(created_at DESC);

-- ── 2. GDPR requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('data_export', 'data_deletion', 'data_correction')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  details jsonb,
  exported_data_url text,
  processed_by uuid REFERENCES users(id),
  processed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_user ON gdpr_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status);

-- ── 3. Internal Messaging ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('department', 'direct', 'announcement', 'emergency')),
  department text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES internal_channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  attachment_url text,
  is_emergency boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internal_messages_channel ON internal_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_messages_recipient ON internal_messages(recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_internal_messages_sender ON internal_messages(sender_id);

-- ── 4. Staff Productivity Metrics ─────────────────────────────
CREATE TABLE IF NOT EXISTS staff_productivity_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  department text NOT NULL,
  tickets_resolved integer NOT NULL DEFAULT 0,
  avg_response_time_minutes numeric(8,2) DEFAULT 0,
  escalations_handled integer NOT NULL DEFAULT 0,
  customer_rating numeric(3,2) DEFAULT 0,
  payments_processed integer NOT NULL DEFAULT 0,
  refunds_handled integer NOT NULL DEFAULT 0,
  revenue_collected numeric(12,2) DEFAULT 0,
  jobs_assigned integer NOT NULL DEFAULT 0,
  avg_assignment_time_minutes numeric(8,2) DEFAULT 0,
  failed_assignments integer NOT NULL DEFAULT 0,
  fraud_cases_reviewed integer NOT NULL DEFAULT 0,
  suspensions_issued integer NOT NULL DEFAULT 0,
  false_positives integer NOT NULL DEFAULT 0,
  incidents_resolved integer NOT NULL DEFAULT 0,
  deployments_made integer NOT NULL DEFAULT 0,
  uptime_percentage numeric(5,2) DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, date)
);
CREATE INDEX IF NOT EXISTS idx_staff_productivity_staff ON staff_productivity_metrics(staff_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_productivity_dept ON staff_productivity_metrics(department, date DESC);

-- ── 5. Category-based Commission Overrides ────────────────────
CREATE TABLE IF NOT EXISTS commission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  commission_rate numeric(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_commission_overrides UNIQUE (category, region)
);

-- Seed default category commissions
INSERT INTO commission_overrides (category, commission_rate, created_by) VALUES
  ('plumbing', 15.00, null),
  ('electrical', 18.00, null),
  ('cleaning', 12.00, null),
  ('carpentry', 15.00, null),
  ('hvac', 18.00, null),
  ('painting', 12.00, null),
  ('appliance_repair', 15.00, null),
  ('construction', 15.00, null),
  ('security_installations', 18.00, null),
  ('internet_installations', 12.00, null)
ON CONFLICT (category, region) DO NOTHING;

-- ── 6. Terms acceptance tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS terms_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  cookie_accepted boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user ON terms_acceptance(user_id);

-- ── 7. Emergency Controls log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_control_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_type text NOT NULL,
  action text NOT NULL CHECK (action IN ('enabled', 'disabled')),
  reason text,
  initiated_by uuid NOT NULL REFERENCES users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  reverted_by uuid REFERENCES users(id),
  reverted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_emergency_controls ON emergency_control_logs(control_type, initiated_at DESC);

-- ── 8. Add permissions ────────────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('can_manage_backups', 'Manage database backups and restores', 'system'),
  ('can_view_staff_productivity', 'View staff productivity metrics', 'system'),
  ('can_use_internal_messaging', 'Use internal staff messaging', 'system'),
  ('can_send_announcements', 'Send platform-wide announcements', 'system'),
  ('can_send_emergency_alerts', 'Send emergency alerts to all staff', 'system'),
  ('can_manage_gdpr_requests', 'Process GDPR data requests', 'system'),
  ('can_use_emergency_controls', 'Use emergency platform controls', 'system'),
  ('can_reset_staff_password', 'Reset staff passwords', 'system'),
  ('can_force_logout', 'Force logout any user', 'system'),
  ('can_require_2fa', 'Require 2FA for staff accounts', 'system'),
  ('can_manage_commission_overrides', 'Manage category-based commission rates', 'finance')
ON CONFLICT (code) DO NOTHING;

-- Grant to super_admin
INSERT INTO role_permissions (role, permission_code)
SELECT 'super_admin', code FROM permissions
WHERE code IN ('can_manage_backups', 'can_view_staff_productivity', 'can_use_internal_messaging',
  'can_send_announcements', 'can_send_emergency_alerts', 'can_manage_gdpr_requests',
  'can_use_emergency_controls', 'can_reset_staff_password', 'can_force_logout',
  'can_require_2fa', 'can_manage_commission_overrides')
ON CONFLICT DO NOTHING;

-- Grant messaging to all staff roles
INSERT INTO role_permissions (role, permission_code)
SELECT r.role, 'can_use_internal_messaging'
FROM (VALUES ('admin'), ('ops_manager'), ('support_agent'), ('fraud_analyst'),
      ('finance_team'), ('dispatch_team'), ('devops_engineer'), ('auditor')) AS r(role)
ON CONFLICT DO NOTHING;

-- Grant productivity viewing to super_admin and devops
INSERT INTO role_permissions (role, permission_code)
SELECT 'devops_engineer', 'can_view_staff_productivity'
ON CONFLICT DO NOTHING;

-- ── 9. Create default internal channels ───────────────────────
INSERT INTO internal_channels (name, type, department) VALUES
  ('General', 'announcement', null),
  ('Operations', 'department', 'operations'),
  ('Finance', 'department', 'finance'),
  ('Trust & Safety', 'department', 'safety'),
  ('Support', 'department', 'support'),
  ('Engineering', 'department', 'engineering'),
  ('Emergency Alerts', 'emergency', null)
ON CONFLICT DO NOTHING;

-- ── 10. Add updated_at triggers ───────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_productivity_updated ON staff_productivity_metrics;
CREATE TRIGGER trg_staff_productivity_updated BEFORE UPDATE ON staff_productivity_metrics
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_commission_overrides_updated ON commission_overrides;
CREATE TRIGGER trg_commission_overrides_updated BEFORE UPDATE ON commission_overrides
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
