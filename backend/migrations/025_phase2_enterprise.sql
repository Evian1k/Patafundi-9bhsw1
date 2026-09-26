-- ============================================================
-- Migration 025: Phase 2 Enterprise Operations Platform
-- 20 modules: DR, Incidents, CRM, Feature Flags, Analytics,
-- Audit Timeline, Fraud Heatmap, Productivity, CEO Center,
-- AI Assistants, Queues, Monitoring, HR, API Versions,
-- Marketplace Intelligence, ML Pricing, Search, Image Moderation
-- ============================================================

-- ── 1. Incident Command Center ────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id text NOT NULL UNIQUE DEFAULT ('INC-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  severity text NOT NULL CHECK (severity IN ('sev0', 'sev1', 'sev2', 'sev3', 'sev4')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'identified', 'monitoring', 'resolved', 'postmortem', 'closed')),
  category text NOT NULL,
  title text NOT NULL,
  description text,
  assigned_engineer uuid REFERENCES users(id),
  assigned_manager uuid REFERENCES users(id),
  affected_services text[],
  affected_customers integer NOT NULL DEFAULT 0,
  downtime_start timestamptz,
  downtime_end timestamptz,
  root_cause text,
  actions_taken text[],
  lessons_learned text,
  postmortem_url text,
  public_message text,
  is_public boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

CREATE TABLE IF NOT EXISTS incident_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL,
  author_id uuid REFERENCES users(id),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON incident_timeline(incident_id, created_at DESC);

-- ── 2. Internal CRM notes (unified) ───────────────────────────
CREATE TABLE IF NOT EXISTS crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'fundi', 'job', 'payment', 'ticket')),
  entity_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_entity ON crm_notes(entity_type, entity_id, created_at DESC);

-- ── 3. Feature Flag System (enhanced) ────────────────────────
-- Already have feature_flags table — add A/B testing support
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  county text,
  country text,
  enabled boolean NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flag_key, user_id),
  UNIQUE (flag_key, county)
);

-- ── 4. Business Analytics (materialized) ─────────────────────
CREATE TABLE IF NOT EXISTS analytics_daily (
  id serial PRIMARY KEY,
  date date NOT NULL UNIQUE DEFAULT current_date,
  new_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  new_fundis integer NOT NULL DEFAULT 0,
  active_fundis integer NOT NULL DEFAULT 0,
  jobs_created integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  jobs_cancelled integer NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  commission numeric(12,2) NOT NULL DEFAULT 0,
  refunds numeric(12,2) NOT NULL DEFAULT 0,
  disputes_opened integer NOT NULL DEFAULT 0,
  disputes_resolved integer NOT NULL DEFAULT 0,
  avg_response_time_minutes numeric(8,2) DEFAULT 0,
  avg_completion_time_minutes numeric(8,2) DEFAULT 0,
  avg_payout_time_hours numeric(8,2) DEFAULT 0,
  retention_rate numeric(5,2) DEFAULT 0,
  churn_rate numeric(5,2) DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Audit Timeline (unified) ───────────────────────────────
CREATE TABLE IF NOT EXISTS audit_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  actor_role text,
  ip_address text,
  user_agent text,
  device_id text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  ai_involved boolean NOT NULL DEFAULT false,
  approval_chain jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_timeline_entity ON audit_timeline(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timeline_actor ON audit_timeline(actor_id);

-- ── 6. Fraud Heatmap data ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_heatmap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_type text NOT NULL,
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  county text,
  country text NOT NULL DEFAULT 'Kenya',
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'medium',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_heatmap_loc ON fraud_heatmap_events(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_fraud_heatmap_type ON fraud_heatmap_events(fraud_type);
CREATE INDEX IF NOT EXISTS idx_fraud_heatmap_county ON fraud_heatmap_events(county);

-- ── 7. Job Queue (async processing) ──────────────────────────
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead_letter')),
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error_message text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, priority DESC, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_name ON job_queue(queue_name);

-- ── 8. HR Management ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id text UNIQUE,
  department text NOT NULL,
  team text,
  position text,
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  hire_date date NOT NULL DEFAULT current_date,
  termination_date date,
  manager_id uuid REFERENCES users(id),
  salary_band text,
  emergency_contact_name text,
  emergency_contact_phone text,
  address text,
  national_id text,
  nhif_number text,
  nssf_number text,
  kra_pin text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'suspended', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_employees_user ON hr_employees(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_dept ON hr_employees(department);

CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'emergency', 'maternity', 'paternity', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_employee ON hr_leave_requests(employee_id, start_date DESC);

CREATE TABLE IF NOT EXISTS hr_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  rating numeric(3,1) NOT NULL CHECK (rating BETWEEN 0 AND 5),
  goals text,
  achievements text,
  areas_for_improvement text,
  reviewer_id uuid REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 9. API Versioning ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_versions (
  id serial PRIMARY KEY,
  version text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'sunset', 'retired')),
  release_date date NOT NULL DEFAULT current_date,
  sunset_date date,
  retirement_date date,
  changelog text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO api_versions (version, status, changelog) VALUES
  ('v1', 'active', 'Initial API release — all endpoints under /api/*'),
  ('v2', 'deprecated', 'Planned: typed responses, cursor pagination, webhook v2')
ON CONFLICT (version) DO NOTHING;

-- ── 10. Marketplace Intelligence ──────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL DEFAULT current_date,
  county text,
  service_category text,
  demand_score integer NOT NULL DEFAULT 0,
  supply_score integer NOT NULL DEFAULT 0,
  gap_score integer NOT NULL DEFAULT 0,
  avg_response_time_minutes numeric(8,2),
  busy_hours text[],
  idle_fundis integer NOT NULL DEFAULT 0,
  active_jobs integer NOT NULL DEFAULT 0,
  revenue_opportunity numeric(12,2) DEFAULT 0,
  recommendation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, county, service_category)
);
CREATE INDEX IF NOT EXISTS idx_market_intel_date ON marketplace_intelligence(metric_date DESC);

-- ── 11. ML Pricing Model ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml_pricing_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model_version text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  factors jsonb NOT NULL,
  base_multiplier numeric(5,2) NOT NULL DEFAULT 1.0,
  max_multiplier numeric(5,2) NOT NULL DEFAULT 3.0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ml_pricing_models (name, model_version, factors) VALUES
  ('Adaptive Pricing v1', '1.0', '{"distance": 0.3, "traffic": 0.15, "weather": 0.1, "emergency": 0.2, "availability": 0.15, "demand": 0.1}')
ON CONFLICT DO NOTHING;

-- ── 12. Image Moderation Queue ───────────────────────────────
CREATE TABLE IF NOT EXISTS image_moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  image_type text NOT NULL CHECK (image_type IN ('job_photo', 'verification_doc', 'selfie', 'portfolio', 'dispute_evidence', 'profile_photo')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  job_id uuid,
  ai_analysis jsonb,
  flags text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected', 'flagged')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_img_mod_status ON image_moderation_queue(status, created_at DESC);

-- ── 13. System Health Monitoring ─────────────────────────────
CREATE TABLE IF NOT EXISTS system_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  status text NOT NULL CHECK (status IN ('operational', 'degraded', 'partial_outage', 'major_outage')),
  response_time_ms integer,
  error_rate numeric(5,2),
  uptime_percentage numeric(5,2),
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_logs_service ON system_health_logs(service, created_at DESC);

-- ── 14. Status Page Incidents (public) ───────────────────────
CREATE TABLE IF NOT EXISTS status_page_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
  service text NOT NULL,
  status text NOT NULL DEFAULT 'investigating',
  message text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_page_resolved ON status_page_incidents(is_resolved, created_at DESC);

-- ── 15. AI CEO Reports ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_ceo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE DEFAULT current_date,
  report_data jsonb NOT NULL,
  recommendations jsonb,
  risks jsonb,
  opportunities jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 16. Permissions ───────────────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('can_manage_incidents', 'Manage incidents and postmortems', 'system'),
  ('can_view_crm', 'View internal CRM data', 'system'),
  ('can_manage_feature_flags', 'Manage feature flags and A/B tests', 'system'),
  ('can_view_analytics', 'View business analytics', 'system'),
  ('can_view_audit_timeline', 'View audit timeline for any entity', 'system'),
  ('can_view_fraud_heatmap', 'View fraud heatmap', 'fraud'),
  ('can_manage_hr', 'Manage HR records and leave', 'system'),
  ('can_view_marketplace_intelligence', 'View marketplace intelligence', 'system'),
  ('can_manage_ml_pricing', 'Manage ML pricing models', 'finance'),
  ('can_moderate_images', 'Moderate uploaded images', 'system'),
  ('can_view_system_health', 'View system health monitoring', 'system'),
  ('can_view_ceo_reports', 'View AI CEO reports', 'system'),
  ('can_manage_queues', 'Manage job queues', 'system')
ON CONFLICT (code) DO NOTHING;

-- Grant all to super_admin
INSERT INTO role_permissions (role, permission_code)
SELECT 'super_admin', code FROM permissions
WHERE code IN ('can_manage_incidents', 'can_view_crm', 'can_manage_feature_flags',
  'can_view_analytics', 'can_view_audit_timeline', 'can_view_fraud_heatmap',
  'can_manage_hr', 'can_view_marketplace_intelligence', 'can_manage_ml_pricing',
  'can_moderate_images', 'can_view_system_health', 'can_view_ceo_reports', 'can_manage_queues')
ON CONFLICT DO NOTHING;

-- Grant relevant to other roles
INSERT INTO role_permissions (role, permission_code) VALUES
  ('devops_engineer', 'can_manage_incidents'),
  ('devops_engineer', 'can_view_system_health'),
  ('devops_engineer', 'can_manage_queues'),
  ('support_agent', 'can_view_crm'),
  ('fraud_analyst', 'can_view_fraud_heatmap'),
  ('finance_team', 'can_view_analytics'),
  ('finance_team', 'can_manage_ml_pricing'),
  ('auditor', 'can_view_audit_timeline'),
  ('auditor', 'can_view_analytics'),
  ('auditor', 'can_view_system_health')
ON CONFLICT DO NOTHING;
