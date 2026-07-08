-- Migration 028: Enterprise Pricing Engine
--
-- Removes the "customer sets budget" model. The platform now calculates
-- prices automatically using base prices + distance + time + weather +
-- demand + complexity + emergency multipliers.
--
-- All values are configurable from the CEO Pricing Dashboard — no code
-- deployment required to change prices.

-- ── 1. Service Base Prices ────────────────────────────────────
-- Every service category has a configurable base price, min price, max price,
-- and complexity tiers. CEO edits these from the dashboard.
CREATE TABLE IF NOT EXISTS service_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category text NOT NULL UNIQUE,
  service_label text NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 1000,
  minimum_price numeric(10,2) NOT NULL DEFAULT 500,
  maximum_price numeric(10,2) NOT NULL DEFAULT 50000,
  -- Complexity multipliers (1.0 = base, 1.5 = 50% more, etc.)
  simple_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
  medium_multiplier numeric(3,2) NOT NULL DEFAULT 1.25,
  complex_multiplier numeric(3,2) NOT NULL DEFAULT 1.75,
  expert_multiplier numeric(3,2) NOT NULL DEFAULT 2.50,
  -- Platform commission percentage (e.g., 15.00 = 15%)
  commission_percent numeric(5,2) NOT NULL DEFAULT 15.00,
  -- Estimated duration in minutes for a typical job
  estimated_duration_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default pricing for all 14 service categories
INSERT INTO service_pricing (service_category, service_label, base_price, minimum_price, maximum_price, estimated_duration_minutes) VALUES
  ('plumbing',           'Plumbing',          1500, 800,   15000, 90),
  ('electrical',         'Electrical',        1200, 600,   20000, 75),
  ('carpentry',          'Carpentry',         2500, 1000,  30000, 120),
  ('cleaning',           'Cleaning',          1000, 500,   10000, 180),
  ('painting',           'Painting',          3500, 1500,  50000, 240),
  ('hvac',               'AC & HVAC',         2000, 1000,  25000, 90),
  ('roofing',            'Roofing',           4000, 2000,  60000, 180),
  ('welding',            'Welding',           3000, 1500,  40000, 120),
  ('appliance-repair',   'Appliance Repair',  1800, 800,   15000, 60),
  ('pest-control',       'Pest Control',      2000, 1000,  12000, 90),
  ('masonry',            'Masonry',           3500, 1500,  50000, 240),
  ('gardening',          'Gardening',         1200, 500,   10000, 120),
  ('moving-services',    'Moving',            2500, 1000,  20000, 180),
  ('vehicle-services',   'Vehicle',           1800, 800,   15000, 60)
ON CONFLICT (service_category) DO NOTHING;

-- ── 2. Pricing Multipliers (time, weather, demand) ────────────
-- Global multipliers that apply to all jobs. CEO can adjust.
CREATE TABLE IF NOT EXISTS pricing_multipliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Time-based
  night_multiplier numeric(3,2) NOT NULL DEFAULT 1.10,      -- 8PM-6AM: +10%
  weekend_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,    -- Sat/Sun: +5%
  holiday_multiplier numeric(3,2) NOT NULL DEFAULT 1.08,    -- Public holidays: +8%
  rush_hour_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,  -- 7-9AM, 5-7PM: +5%
  -- Emergency
  emergency_multiplier numeric(3,2) NOT NULL DEFAULT 1.15,  -- Emergency: +15%
  immediate_multiplier numeric(3,2) NOT NULL DEFAULT 1.20,  -- Within 30 min: +20%
  -- Weather (fetched from weather API, applied when active)
  rain_light_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,
  rain_heavy_multiplier numeric(3,2) NOT NULL DEFAULT 1.10,
  storm_multiplier numeric(3,2) NOT NULL DEFAULT 1.15,
  -- Surge (demand vs supply)
  surge_low_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,   -- High demand: +5%
  surge_medium_multiplier numeric(3,2) NOT NULL DEFAULT 1.10,-- Very high: +10%
  surge_high_multiplier numeric(3,2) NOT NULL DEFAULT 1.25,  -- Extreme: +25%
  -- Distance tiers (KES per km above the free threshold)
  distance_free_km numeric(5,1) NOT NULL DEFAULT 3.0,       -- 0-3km: free
  distance_rate_tier1 numeric(5,2) NOT NULL DEFAULT 50.00,  -- 3-10km: 50/km
  distance_rate_tier2 numeric(5,2) NOT NULL DEFAULT 75.00,  -- 10-20km: 75/km
  distance_rate_tier3 numeric(5,2) NOT NULL DEFAULT 120.00, -- 20-40km: 120/km
  distance_max_km numeric(5,1) NOT NULL DEFAULT 40.0,       -- 40km+: needs approval
  -- Platform fee (flat fee added to every job)
  platform_fee numeric(10,2) NOT NULL DEFAULT 100.00,
  -- Fundi tier commission overrides (lower commission for top fundis)
  fundi_tier_bronze_commission numeric(5,2) NOT NULL DEFAULT 15.00,
  fundi_tier_silver_commission numeric(5,2) NOT NULL DEFAULT 14.00,
  fundi_tier_gold_commission numeric(5,2) NOT NULL DEFAULT 12.00,
  fundi_tier_platinum_commission numeric(5,2) NOT NULL DEFAULT 10.00,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed one row with defaults
INSERT INTO pricing_multipliers (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

-- ── 3. County Pricing Overrides ───────────────────────────────
-- Allow different base prices per county (Nairobi more expensive than rural)
CREATE TABLE IF NOT EXISTS county_pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county text NOT NULL,
  service_category text NOT NULL,
  price_adjustment_percent numeric(5,2) NOT NULL DEFAULT 0.00, -- e.g., +10.00 = 10% more
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(county, service_category)
);

-- ── 4. Special Events (surge pricing) ─────────────────────────
-- CEO can manually trigger surge for events (concerts, matches, etc.)
CREATE TABLE IF NOT EXISTS pricing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                 -- e.g., "Nairobi Marathon 2026"
  county text,                        -- affected county (null = all)
  multiplier numeric(3,2) NOT NULL DEFAULT 1.20,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Price Calculation Log ──────────────────────────────────
-- Every price calculation is logged for transparency + audit + AI learning
CREATE TABLE IF NOT EXISTS price_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  service_category text NOT NULL,
  base_price numeric(10,2) NOT NULL,
  distance_km numeric(8,2),
  travel_fee numeric(10,2) NOT NULL DEFAULT 0,
  time_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
  emergency_fee numeric(10,2) NOT NULL DEFAULT 0,
  weather_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
  surge_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
  complexity_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
  county_adjustment_percent numeric(5,2) NOT NULL DEFAULT 0.00,
  platform_fee numeric(10,2) NOT NULL DEFAULT 0,
  estimated_duration_minutes integer,
  final_price numeric(10,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  commission_amount numeric(10,2) NOT NULL,
  fundi_earnings numeric(10,2) NOT NULL,
  factors jsonb NOT NULL DEFAULT '{}',  -- detailed breakdown for audit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_calc_job ON price_calculations(job_id);
CREATE INDEX IF NOT EXISTS idx_price_calc_category ON price_calculations(service_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_calc_user ON price_calculations(user_id, created_at DESC);

-- ── 6. AI Pricing Recommendations ─────────────────────────────
-- AI suggests price adjustments; CEO must approve before they take effect
CREATE TABLE IF NOT EXISTS ai_pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category text,
  county text,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('increase', 'decrease', 'surge_on', 'surge_off')),
  current_price numeric(10,2),
  suggested_price numeric(10,2),
  adjustment_percent numeric(5,2),
  reason text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.50,  -- 0.00 to 1.00
  data_basis jsonb NOT NULL DEFAULT '{}',          -- the metrics behind the recommendation
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_pricing_status ON ai_pricing_recommendations(status, created_at DESC);

-- ── 7. Add final_price to jobs if not exists ──────────────────
-- (The platform-calculated price, set when customer accepts the quote)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS platform_price numeric(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS price_calculation_id uuid REFERENCES price_calculations(id);
