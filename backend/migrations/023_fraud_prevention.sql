-- ============================================================
-- Migration 023: Enterprise Fraud Prevention — 7 Systems
-- ============================================================

-- ── 1. Device Fingerprinting ──────────────────────────────────
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  browser_fingerprint text,
  canvas_fingerprint text,
  webgl_fingerprint text,
  user_agent text,
  platform text,
  screen_size text,
  timezone text,
  language text,
  installed_fonts text[],
  ip_address text,
  risk_score integer NOT NULL DEFAULT 0,
  is_trusted boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_fp_user ON device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fp_device ON device_fingerprints(device_id);
CREATE INDEX IF NOT EXISTS idx_device_fp_browser ON device_fingerprints(browser_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_fp_canvas ON device_fingerprints(canvas_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_fp_risk ON device_fingerprints(risk_score DESC) WHERE risk_score > 0;

-- ── 2. IP Reputation ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_reputation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  country text,
  city text,
  asn text,
  isp text,
  is_vpn boolean NOT NULL DEFAULT false,
  is_proxy boolean NOT NULL DEFAULT false,
  is_tor boolean NOT NULL DEFAULT false,
  is_hosting boolean NOT NULL DEFAULT false,
  risk_level text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('trusted', 'normal', 'suspicious', 'high_risk', 'blocked')),
  fraud_reports integer NOT NULL DEFAULT 0,
  total_logins integer NOT NULL DEFAULT 0,
  blocked_logins integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_rep_ip ON ip_reputation(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_rep_risk ON ip_reputation(risk_level);

-- ── 3. Login History (for impossible travel) ──────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  country text,
  city text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  device_id text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  is_impossible_travel boolean NOT NULL DEFAULT false,
  travel_distance_km numeric(10,2),
  travel_time_minutes integer,
  previous_login_id uuid REFERENCES login_history(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_hist_user ON login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_hist_impossible ON login_history(is_impossible_travel) WHERE is_impossible_travel = true;
CREATE INDEX IF NOT EXISTS idx_login_hist_ip ON login_history(ip_address);

-- ── 4. GPS Validation (spoof detection) ───────────────────────
CREATE TABLE IF NOT EXISTS gps_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundi_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid,
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  accuracy numeric(10,2),
  speed_kmh numeric(10,2),
  is_spoofed boolean NOT NULL DEFAULT false,
  spoof_indicators text[],
  risk_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gps_val_fundi ON gps_validations(fundi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_val_spoofed ON gps_validations(is_spoofed) WHERE is_spoofed = true;
CREATE INDEX IF NOT EXISTS idx_gps_val_job ON gps_validations(job_id);

-- ── 5. Blacklist System ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS blacklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blacklist_type text NOT NULL CHECK (blacklist_type IN ('email', 'phone', 'national_id', 'device', 'ip', 'mpesa_number', 'business')),
  value text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('fraud', 'chargeback', 'identity_theft', 'spam', 'abuse', 'duplicate_accounts', 'manual')),
  details text,
  is_permanent boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blacklist_type, value)
);
CREATE INDEX IF NOT EXISTS idx_blacklist_type_value ON blacklists(blacklist_type, value);
CREATE INDEX IF NOT EXISTS idx_blacklist_reason ON blacklists(reason);

-- ── 6. Behavioral Risk Scores ─────────────────────────────────
CREATE TABLE IF NOT EXISTS behavioral_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  login_frequency_30d integer NOT NULL DEFAULT 0,
  payment_frequency_30d integer NOT NULL DEFAULT 0,
  referral_activity_30d integer NOT NULL DEFAULT 0,
  review_anomaly_score integer NOT NULL DEFAULT 0,
  job_cancellation_rate numeric(5,2) NOT NULL DEFAULT 0,
  message_spam_score integer NOT NULL DEFAULT 0,
  account_age_days integer NOT NULL DEFAULT 0,
  completion_rate numeric(5,2) NOT NULL DEFAULT 0,
  acceptance_rate numeric(5,2) NOT NULL DEFAULT 0,
  trust_score integer NOT NULL DEFAULT 100,
  factors jsonb,
  last_recalculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_behavioral_risk_user ON behavioral_risk_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_risk_level ON behavioral_risk_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_behavioral_risk_score ON behavioral_risk_scores(risk_score DESC);

-- ── 7. Chargeback & Payment Fraud Monitoring ──────────────────
CREATE TABLE IF NOT EXISTS payment_fraud_monitoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id uuid,
  job_id uuid,
  mpesa_number text,
  fraud_type text NOT NULL CHECK (fraud_type IN ('chargeback', 'duplicate_payment', 'refund_abuse', 'escrow_abuse', 'wallet_abuse', 'failed_payment_spree', 'high_risk_mpesa', 'disputed_transaction')),
  amount numeric(12,2),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'investigating', 'confirmed', 'false_positive', 'resolved')),
  evidence jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_fraud_user ON payment_fraud_monitoring(user_id);
CREATE INDEX IF NOT EXISTS idx_pay_fraud_type ON payment_fraud_monitoring(fraud_type);
CREATE INDEX IF NOT EXISTS idx_pay_fraud_status ON payment_fraud_monitoring(status);
CREATE INDEX IF NOT EXISTS idx_pay_fraud_mpesa ON payment_fraud_monitoring(mpesa_number);

-- ── 8. Add permissions ────────────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('can_view_fraud_prevention', 'View fraud prevention dashboards and data', 'fraud'),
  ('can_manage_blacklist', 'Manage blacklist entries', 'fraud'),
  ('can_investigate_fraud', 'Investigate fraud cases', 'fraud')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code)
SELECT 'super_admin', code FROM permissions
WHERE code IN ('can_view_fraud_prevention', 'can_manage_blacklist', 'can_investigate_fraud')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code)
SELECT 'fraud_analyst', code FROM permissions
WHERE code IN ('can_view_fraud_prevention', 'can_investigate_fraud')
ON CONFLICT DO NOTHING;

-- ── 9. Triggers ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_fp_updated ON device_fingerprints;
CREATE TRIGGER trg_device_fp_updated BEFORE UPDATE ON device_fingerprints
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ip_rep_updated ON ip_reputation;
CREATE TRIGGER trg_ip_rep_updated BEFORE UPDATE ON ip_reputation
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_behavioral_risk_updated ON behavioral_risk_scores;
CREATE TRIGGER trg_behavioral_risk_updated BEFORE UPDATE ON behavioral_risk_scores
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
