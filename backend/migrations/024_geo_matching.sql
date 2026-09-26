-- ============================================================
-- Migration 024: Geographic Matching & Restrictions System
-- ============================================================

-- ── 1. Service radius rules ───────────────────────────────────
CREATE TABLE IF NOT EXISTS service_radius_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category text NOT NULL UNIQUE,
  max_radius_km integer NOT NULL DEFAULT 50,
  is_unlimited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO service_radius_rules (service_category, max_radius_km, is_unlimited) VALUES
  ('plumbing', 15, false),
  ('electrical', 20, false),
  ('cleaning', 10, false),
  ('painting', 30, false),
  ('hvac', 20, false),
  ('carpentry', 25, false),
  ('roofing', 50, false),
  ('welding', 50, false),
  ('appliance-repair', 15, false),
  ('pest-control', 20, false),
  ('masonry', 100, false),
  ('gardening', 15, false),
  ('moving-services', 100, false),
  ('vehicle-services', 30, false),
  ('consultation', 99999, true),
  ('legal', 99999, true),
  ('tutoring', 99999, true)
ON CONFLICT (service_category) DO NOTHING;

-- ── 2. Fundi travel settings ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fundi_travel_settings (
  fundi_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_travel_km integer NOT NULL DEFAULT 20,
  willing_to_travel_far boolean NOT NULL DEFAULT false,
  travel_fee_per_km numeric(8,2) NOT NULL DEFAULT 0,
  night_rate_multiplier numeric(3,2) NOT NULL DEFAULT 1.0,
  emergency_available boolean NOT NULL DEFAULT false,
  temporary_location_lat numeric(10,6),
  temporary_location_lng numeric(10,6),
  temporary_location_expires timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Geo-fencing zones ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN ('neighborhood', 'city', 'county', 'country')),
  country text NOT NULL DEFAULT 'Kenya',
  county text,
  city text,
  center_lat numeric(10,6),
  center_lng numeric(10,6),
  radius_km integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_zones_type ON geo_zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_geo_zones_active ON geo_zones(is_active) WHERE is_active = true;

-- ── 4. International booking requests ─────────────────────────
CREATE TABLE IF NOT EXISTS international_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_country text NOT NULL,
  destination_city text NOT NULL,
  destination_address text,
  service_needed text NOT NULL,
  expected_budget numeric(12,2),
  start_date date,
  end_date date,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intl_bookings_status ON international_bookings(status);
CREATE INDEX IF NOT EXISTS idx_intl_bookings_customer ON international_bookings(customer_id);

-- ── 5. CEO geo controls (platform settings) ──────────────────
CREATE TABLE IF NOT EXISTS geo_controls (
  id serial PRIMARY KEY,
  max_radius_km integer NOT NULL DEFAULT 100,
  emergency_radius_km integer NOT NULL DEFAULT 80,
  min_distance_km integer NOT NULL DEFAULT 0,
  travel_fee_per_km numeric(8,2) NOT NULL DEFAULT 50,
  night_fee numeric(8,2) NOT NULL DEFAULT 500,
  emergency_fee numeric(8,2) NOT NULL DEFAULT 1000,
  international_enabled boolean NOT NULL DEFAULT false,
  cross_county_enabled boolean NOT NULL DEFAULT true,
  cross_country_enabled boolean NOT NULL DEFAULT false,
  disaster_mode boolean NOT NULL DEFAULT false,
  disaster_radius_multiplier numeric(3,2) NOT NULL DEFAULT 2.0,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO geo_controls (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── 6. Blocked countries/counties ─────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_type text NOT NULL CHECK (region_type IN ('country', 'county')),
  region_value text NOT NULL,
  reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_type, region_value)
);

-- ── 7. Fundi active job count (for overload check) ────────────
-- Add a column to track active jobs count for overload protection
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS max_concurrent_jobs integer NOT NULL DEFAULT 3;

-- ── 8. Surge pricing records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS surge_pricing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  customer_id uuid REFERENCES users(id) ON DELETE CASCADE,
  fundi_id uuid REFERENCES users(id) ON DELETE CASCADE,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  travel_fee numeric(12,2) NOT NULL DEFAULT 0,
  emergency_fee numeric(12,2) NOT NULL DEFAULT 0,
  night_fee numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  distance_km numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 9. Permissions ────────────────────────────────────────────
INSERT INTO permissions (code, description, category) VALUES
  ('can_manage_geo_controls', 'Manage geographic controls and restrictions', 'system'),
  ('can_approve_international', 'Approve/reject international booking requests', 'system')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code)
SELECT 'super_admin', code FROM permissions
WHERE code IN ('can_manage_geo_controls', 'can_approve_international')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code)
SELECT 'support_agent', 'can_approve_international'
ON CONFLICT DO NOTHING;
