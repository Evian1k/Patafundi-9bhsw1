-- 033_takeover_fixes.sql — PataFundi ZAI takeover: foundation repairs
-- 1) Extend job lifecycle (company dispatch + scheduled + quote/confirmation states)
-- 2) Fix payments / escrow status CHECKs that made refunds + escrow release impossible
-- 3) Create fundi_wallets / wallet_transactions (referenced by code, never migrated)
-- 4) Company ecosystem tables: services catalog, settlements, availability, ratings

-- ── 1. jobs.status lifecycle ────────────────────────────────────────────────
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN (
  'pending', 'matching', 'offered', 'accepted', 'assigned', 'scheduled',
  'on_the_way', 'arrived', 'in_progress', 'completion_requested',
  'completed', 'cancelled', 'failed'
));

-- jobs.payment_status: align with the full money lifecycle (incl. refunded —
-- dispute refunds write this value and were previously rejected by the CHECK)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_payment_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_payment_status_check CHECK (payment_status IN (
  'pending', 'escrow_held', 'completion_requested', 'otp_verified',
  'customer_confirmed', 'payout_processing', 'payout_completed', 'failed', 'refunded'
));

-- provider_type: distinguishes individual-fundi jobs from company-delivered jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'fundi'
  CHECK (provider_type IN ('fundi', 'company'));
CREATE INDEX IF NOT EXISTS idx_jobs_provider_type ON jobs(provider_type);
CREATE INDEX IF NOT EXISTS idx_jobs_company_status ON jobs(company_id, status);

-- ── 2. payments.status — refunds were impossible before ────────────────────
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'pending', 'completed', 'failed', 'cancelled', 'refunded'
));

-- escrow_transactions.status — confirmCompletion wrote 'completed' (illegal) and
-- the whole release transaction rolled back every time. Allow it + fix code too.
ALTER TABLE escrow_transactions DROP CONSTRAINT IF EXISTS escrow_transactions_status_check;
ALTER TABLE escrow_transactions ADD CONSTRAINT escrow_transactions_status_check CHECK (status IN (
  'pending', 'held', 'released', 'refunded', 'frozen', 'completed'
));

-- payouts.status — add settled for company settlement payouts
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check CHECK (status IN (
  'requested', 'processing', 'completed', 'failed', 'cancelled'
));

-- ── 3. fundi wallet tables (code referenced them; tables never existed) ────
CREATE TABLE IF NOT EXISTS fundi_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundi_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  pending_balance numeric(12,2) NOT NULL DEFAULT 0,
  total_earned numeric(12,2) NOT NULL DEFAULT 0,
  total_withdrawn numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'KES',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundi_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  balance_after numeric(12,2),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_fundi ON wallet_transactions(fundi_id);

-- ── 4. Company ecosystem ───────────────────────────────────────────────────
-- 4a. Company service catalog (customer-safe)
CREATE TABLE IF NOT EXISTS company_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  base_price numeric(12,2),
  duration_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_services_company ON company_services(company_id);

-- 4b. Company settlements (company earnings owed/paid by the platform)
CREATE TABLE IF NOT EXISTS company_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  gross_amount numeric(12,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  period_start date,
  period_end date,
  paid_at timestamptz,
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_settlements_company ON company_settlements(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settlements_job ON company_settlements(job_id) WHERE job_id IS NOT NULL;

-- 4c. Customer-safe company storefront columns
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS rating numeric(3,2) NOT NULL DEFAULT 0;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS completed_jobs integer NOT NULL DEFAULT 0;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available'
  CHECK (availability IN ('available', 'busy', 'unavailable'));
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS guarantees jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 0;

-- 4d. technician availability + workload on company_members, plus extended
--      company roles (dispatcher / finance) required by the portal spec
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT array[]::text[];
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE company_members ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('owner', 'manager', 'admin', 'dispatcher', 'finance', 'technician'));

-- 4e. company application richer lifecycle (spec: draft..suspended)
ALTER TABLE company_partner_applications DROP CONSTRAINT IF EXISTS company_partner_applications_status_check;
ALTER TABLE company_partner_applications ADD CONSTRAINT company_partner_applications_status_check
  CHECK (status IN ('draft', 'submitted', 'reviewing', 'more_info_required', 'approved', 'rejected', 'suspended', 'archived'));

-- 4f. Multi-property support (spec §25): customers keep home/office/rental/etc.
CREATE TABLE IF NOT EXISTS customer_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  property_type text NOT NULL DEFAULT 'home'
    CHECK (property_type IN ('home', 'office', 'rental', 'shop', 'parents_home', 'other')),
  address_line text,
  location_name text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  access_notes text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_properties_customer ON customer_properties(customer_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES customer_properties(id) ON DELETE SET NULL;

-- job_timeline: allow company-workflow event types
ALTER TABLE job_timeline DROP CONSTRAINT IF EXISTS job_timeline_event_type_check;
ALTER TABLE job_timeline ADD CONSTRAINT job_timeline_event_type_check CHECK (event_type IN (
  'job_created', 'job_posted', 'fundi_matched', 'fundi_accepted', 'fundi_arrived',
  'work_started', 'work_completed', 'customer_confirmed', 'payment_made',
  'escrow_released', 'payout_requested', 'payout_completed', 'job_cancelled',
  'company_accepted', 'quote_sent', 'technician_assigned', 'technician_unassigned',
  'status_changed', 'quote_approved', 'quote_rejected', 'review_submitted'
));

-- 4g. audit note table
CREATE TABLE IF NOT EXISTS takeover_audit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO takeover_audit_notes (note) VALUES
  ('033_takeover_fixes applied: job lifecycle extended, payments/escrow CHECKs repaired, fundi wallet tables created, company ecosystem tables added');
