-- ============================================================
-- Migration 021: Business Roadmap Completeness
-- ============================================================

-- ── 1. Customer profile fields ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS town text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- ── 2. Fundi KRA PIN + Business permit + tier ─────────────────
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS business_permit_url text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS fundi_tier text NOT NULL DEFAULT 'bronze'
  CHECK (fundi_tier IN ('bronze', 'silver', 'gold', 'platinum', 'elite', 'master'));

-- ── 3. Service categories (14 categories per spec) ────────────
INSERT INTO service_categories (slug, title, icon, is_active) VALUES
  ('plumbing', 'Plumbing', 'wrench', true),
  ('electrical', 'Electrical', 'zap', true),
  ('carpentry', 'Carpentry', 'hammer', true),
  ('cleaning', 'Cleaning', 'sparkles', true),
  ('painting', 'Painting', 'paintbrush', true),
  ('hvac', 'AC & HVAC', 'wind', true),
  ('roofing', 'Roofing', 'home', true),
  ('welding', 'Welding', 'flame', true),
  ('appliance-repair', 'Appliance Repair', 'settings', true),
  ('pest-control', 'Pest Control', 'bug', true),
  ('masonry', 'Masonry', 'building', true),
  ('gardening', 'Gardening', 'leaf', true),
  ('moving-services', 'Moving Services', 'truck', true),
  ('vehicle-services', 'Vehicle Services', 'car', true)
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- ── 4. Dispute escalation levels ──────────────────────────────
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 1;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS sla_deadline timestamptz;

-- Update existing open disputes with SLA deadlines
UPDATE disputes SET sla_deadline = created_at + interval '24 hours' WHERE status = 'open' AND sla_deadline IS NULL;

-- ── 5. CEO dashboard materialized view (for performance) ──────
CREATE TABLE IF NOT EXISTS ceo_dashboard_cache (
  id serial PRIMARY KEY,
  metric_key text NOT NULL UNIQUE,
  metric_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Fundi tier thresholds ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fundi_tier_thresholds (
  tier text PRIMARY KEY,
  min_rating numeric(3,2) NOT NULL DEFAULT 0,
  min_completed_jobs integer NOT NULL DEFAULT 0,
  max_complaint_rate numeric(5,2) NOT NULL DEFAULT 100,
  min_response_time_minutes integer NOT NULL DEFAULT 999999,
  min_quality_score integer NOT NULL DEFAULT 0,
  commission_discount numeric(5,2) NOT NULL DEFAULT 0
);

INSERT INTO fundi_tier_thresholds (tier, min_rating, min_completed_jobs, max_complaint_rate, min_response_time_minutes, min_quality_score, commission_discount) VALUES
  ('bronze',   0.00, 0,    100,  999999, 0,   0.00),
  ('silver',   4.00, 10,   10,   30,     50,  0.00),
  ('gold',     4.30, 50,   5,    20,     65,  1.00),
  ('platinum', 4.60, 200,  3,    15,     75,  2.00),
  ('elite',    4.80, 500,  2,    10,     85,  3.00),
  ('master',   4.90, 1000, 1,    5,      90,  5.00)
ON CONFLICT (tier) DO NOTHING;
