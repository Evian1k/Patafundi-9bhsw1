-- Migration 030: Global Multi-Country Architecture
--
-- Transforms PataFundi from Kenya-first to a global platform supporting 100+ countries.
-- Each country has its own: currency, timezone, tax rules, payment methods, verification,
-- pricing, commission, emergency contacts, and legal policies.
--
-- The CEO can launch a new country from the dashboard without code changes.

-- ── 1. Countries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,              -- ISO 3166-1 alpha-2: KE, US, GB, NG, etc.
  name text NOT NULL,                     -- Kenya, United States, etc.
  currency_code text NOT NULL,            -- KES, USD, EUR, etc.
  currency_symbol text NOT NULL,          -- KSh, $, €, etc.
  currency_name text NOT NULL,            -- Kenyan Shilling, US Dollar, etc.
  phone_code text NOT NULL,               -- +254, +1, +44, etc.
  timezone text NOT NULL,                 -- Africa/Nairobi, America/New_York, etc.
  default_language text NOT NULL DEFAULT 'en',  -- en, sw, fr, es, ar, etc.
  flag_emoji text,                        -- 🇰🇪, 🇺🇸, etc. (for UI display)
  -- Tax configuration
  vat_percent numeric(5,2) NOT NULL DEFAULT 0.00,
  vat_name text NOT NULL DEFAULT 'VAT',   -- 'VAT', 'GST', 'Sales Tax', etc.
  tax_inclusive boolean NOT NULL DEFAULT true,  -- prices include tax?
  -- Status
  is_active boolean NOT NULL DEFAULT false,
  launched_at timestamptz,
  -- Metadata
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed Kenya (default country)
INSERT INTO countries (code, name, currency_code, currency_symbol, currency_name, phone_code, timezone, default_language, flag_emoji, vat_percent, vat_name, is_active, launched_at)
VALUES ('KE', 'Kenya', 'KES', 'KSh', 'Kenyan Shilling', '+254', 'Africa/Nairobi', 'en', '🇰🇪', 16.00, 'VAT', true, now())
ON CONFLICT (code) DO NOTHING;

-- ── 2. Country Payment Methods ────────────────────────────────
CREATE TABLE IF NOT EXISTS country_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  provider text NOT NULL,                 -- 'mpesa', 'stripe', 'paypal', 'sepa', 'apple_pay', etc.
  display_name text NOT NULL,             -- 'M-Pesa', 'Credit Card', 'Apple Pay'
  provider_type text NOT NULL CHECK (provider_type IN ('mobile_money', 'card', 'bank', 'wallet', 'cash', 'crypto')),
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',     -- provider-specific config (shortcode, API keys ref, etc.)
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_code, provider)
);

-- Seed Kenya payment methods
INSERT INTO country_payment_methods (country_code, provider, display_name, provider_type, display_order) VALUES
  ('KE', 'mpesa', 'M-Pesa', 'mobile_money', 1),
  ('KE', 'card', 'Credit/Debit Card', 'card', 2),
  ('KE', 'cash', 'Cash on Completion', 'cash', 3)
ON CONFLICT DO NOTHING;

-- ── 3. Country Verification Requirements ──────────────────────
CREATE TABLE IF NOT EXISTS country_verification_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  document_type text NOT NULL,            -- 'national_id', 'passport', 'drivers_license', 'residence_permit', 'business_license', 'tax_certificate', 'police_clearance', 'professional_license'
  display_name text NOT NULL,             -- 'National ID', 'Passport', etc.
  is_required boolean NOT NULL DEFAULT true,
  is_optional boolean NOT NULL DEFAULT false,
  instructions text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_code, document_type)
);

-- Seed Kenya verification
INSERT INTO country_verification_requirements (country_code, document_type, display_name, is_required, display_order) VALUES
  ('KE', 'national_id', 'National ID', true, 1),
  ('KE', 'selfie', 'Selfie Photo', true, 2),
  ('KE', 'certificate', 'Professional Certificate', false, 3),
  ('KE', 'police_clearance', 'Police Clearance', false, 4)
ON CONFLICT DO NOTHING;

-- ── 4. Country Emergency Contacts ─────────────────────────────
CREATE TABLE IF NOT EXISTS country_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  service text NOT NULL,                  -- 'Police', 'Ambulance', 'Fire', 'Emergency'
  phone text NOT NULL,                    -- '999', '911', '112', etc.
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed Kenya emergency
INSERT INTO country_emergency_contacts (country_code, service, phone) VALUES
  ('KE', 'Police', '999'),
  ('KE', 'Ambulance', '999'),
  ('KE', 'Fire', '999'),
  ('KE', 'Emergency', '112')
ON CONFLICT DO NOTHING;

-- ── 5. Country Pricing Overrides ──────────────────────────────
-- Per-country pricing multipliers and minimum wages
CREATE TABLE IF NOT EXISTS country_pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  -- Cost of living index (100 = world average, used to scale base prices)
  cost_of_living_index numeric(5,2) NOT NULL DEFAULT 100.00,
  -- Minimum service price in local currency
  minimum_service_price numeric(10,2) NOT NULL DEFAULT 500.00,
  -- Maximum service price in local currency
  maximum_service_price numeric(10,2) NOT NULL DEFAULT 100000.00,
  -- Default commission for this country
  default_commission_percent numeric(5,2) NOT NULL DEFAULT 15.00,
  -- Distance pricing in local currency per km
  distance_rate_tier1 numeric(10,2) NOT NULL DEFAULT 50.00,
  distance_rate_tier2 numeric(10,2) NOT NULL DEFAULT 75.00,
  distance_rate_tier3 numeric(10,2) NOT NULL DEFAULT 120.00,
  -- Platform fee in local currency
  platform_fee numeric(10,2) NOT NULL DEFAULT 100.00,
  -- Emergency multipliers
  emergency_multiplier numeric(3,2) NOT NULL DEFAULT 1.15,
  immediate_multiplier numeric(3,2) NOT NULL DEFAULT 1.20,
  -- Time multipliers
  night_multiplier numeric(3,2) NOT NULL DEFAULT 1.10,
  weekend_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,
  holiday_multiplier numeric(3,2) NOT NULL DEFAULT 1.08,
  rush_hour_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,
  -- Surge
  surge_low_multiplier numeric(3,2) NOT NULL DEFAULT 1.05,
  surge_medium_multiplier numeric(3,2) NOT NULL DEFAULT 1.10,
  surge_high_multiplier numeric(3,2) NOT NULL DEFAULT 1.25,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_code)
);

-- Seed Kenya pricing
INSERT INTO country_pricing_config (country_code, cost_of_living_index, minimum_service_price, maximum_service_price) VALUES
  ('KE', 45.20, 500.00, 100000.00)
ON CONFLICT DO NOTHING;

-- ── 6. Country Service Categories ─────────────────────────────
-- Override which services are available per country + per-country pricing
CREATE TABLE IF NOT EXISTS country_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  service_category text NOT NULL,         -- 'plumbing', 'electrical', etc.
  is_available boolean NOT NULL DEFAULT true,
  base_price numeric(10,2) NOT NULL DEFAULT 1000.00,
  minimum_price numeric(10,2) NOT NULL DEFAULT 500.00,
  maximum_price numeric(10,2) NOT NULL DEFAULT 50000.00,
  estimated_duration_minutes integer NOT NULL DEFAULT 60,
  display_name text,                      -- localized name
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_code, service_category)
);

-- ── 7. Exchange Rates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,            -- 'KES', 'USD', etc.
  to_currency text NOT NULL,              -- 'USD', 'KES', etc.
  rate numeric(12,6) NOT NULL,            -- 1 from_currency = rate to_currency
  source text NOT NULL DEFAULT 'manual',  -- 'manual', 'fixer', 'ecb', 'openexchangerates'
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_currency, to_currency, fetched_at::date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency, fetched_at DESC);

-- Seed some default rates (KES as base)
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('KES', 'USD', 0.0077, 'manual'),
  ('USD', 'KES', 129.87, 'manual'),
  ('KES', 'EUR', 0.0071, 'manual'),
  ('EUR', 'KES', 140.85, 'manual'),
  ('KES', 'GBP', 0.0060, 'manual'),
  ('GBP', 'KES', 166.67, 'manual'),
  ('KES', 'UGX', 28.50, 'manual'),
  ('UGX', 'KES', 0.035, 'manual'),
  ('KES', 'TZS', 17.80, 'manual'),
  ('TZS', 'KES', 0.056, 'manual'),
  ('KES', 'NGN', 11.70, 'manual'),
  ('NGN', 'KES', 0.085, 'manual'),
  ('KES', 'ZAR', 0.140, 'manual'),
  ('ZAR', 'KES', 7.14, 'manual'),
  ('USD', 'EUR', 0.920, 'manual'),
  ('EUR', 'USD', 1.087, 'manual')
ON CONFLICT DO NOTHING;

-- ── 8. Languages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS languages (
  code text PRIMARY KEY,                  -- 'en', 'sw', 'fr', 'es', 'ar', etc.
  name text NOT NULL,                     -- 'English', 'Swahili', 'French', etc.
  native_name text NOT NULL,              -- 'English', 'Kiswahili', 'Français', etc.
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO languages (code, name, native_name) VALUES
  ('en', 'English', 'English'),
  ('sw', 'Swahili', 'Kiswahili'),
  ('fr', 'French', 'Français'),
  ('es', 'Spanish', 'Español'),
  ('ar', 'Arabic', 'العربية'),
  ('pt', 'Portuguese', 'Português'),
  ('de', 'German', 'Deutsch'),
  ('zh', 'Chinese', '中文'),
  ('ja', 'Japanese', '日本語'),
  ('hi', 'Hindi', 'हिन्दी')
ON CONFLICT (code) DO NOTHING;

-- ── 9. Translations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  key text NOT NULL,                      -- 'job.create', 'common.cancel', etc.
  value text NOT NULL,                    -- translated text
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(language_code, key)
);

CREATE INDEX IF NOT EXISTS idx_translations_lang ON translations(language_code, key);

-- ── 10. Country Staff Assignments ─────────────────────────────
CREATE TABLE IF NOT EXISTS country_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  department text NOT NULL,               -- 'support', 'operations', 'fraud', 'finance', 'verification'
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, country_code, department)
);

-- ── 11. Add country to users table ────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'KE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Africa/Nairobi';

-- ── 12. Add country to jobs table ─────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'KE';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'KES';

-- ── 13. Add country to payments ───────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'KE';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'KES';

-- ── 14. Global Analytics ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS country_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  date date NOT NULL,
  total_jobs integer NOT NULL DEFAULT 0,
  completed_jobs integer NOT NULL DEFAULT 0,
  cancelled_jobs integer NOT NULL DEFAULT 0,
  total_revenue numeric(12,2) NOT NULL DEFAULT 0,
  platform_revenue numeric(12,2) NOT NULL DEFAULT 0,
  new_customers integer NOT NULL DEFAULT 0,
  new_fundis integer NOT NULL DEFAULT 0,
  active_fundis integer NOT NULL DEFAULT 0,
  avg_job_value numeric(10,2) NOT NULL DEFAULT 0,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_code, date)
);

CREATE INDEX IF NOT EXISTS idx_country_analytics_date ON country_analytics(country_code, date DESC);
