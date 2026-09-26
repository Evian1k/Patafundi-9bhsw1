-- Migration 029: Commission Campaigns + Financial Confidentiality
--
-- Implements:
--   1. Commission campaigns (temporary commission overrides, CEO-approved)
--   2. Revenue ledger (CEO-only access to all financial data)
--   3. Role-based financial access control (staff see only what they need)

-- ── 1. Commission Campaigns ───────────────────────────────────
-- Temporary commission overrides that expire automatically.
-- Example: "Master Fundis Week" — 12% commission for 7 days, then reverts.
CREATE TABLE IF NOT EXISTS commission_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  -- Targeting: which fundis get the reduced commission
  fundi_tier text,  -- 'bronze', 'silver', 'gold', 'platinum', or NULL = all
  county text,      -- specific county, or NULL = all counties
  service_category text,  -- specific category, or NULL = all
  -- The temporary commission rate
  campaign_commission_percent numeric(5,2) NOT NULL,  -- e.g., 12.00 = 12%
  default_commission_percent numeric(5,2) NOT NULL,   -- what it reverts to after
  -- Duration
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'expired', 'cancelled')),
  -- Audit
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_active ON commission_campaigns(status, starts_at, ends_at);

-- ── 2. Revenue Ledger ─────────────────────────────────────────
-- Every monetary transaction is recorded here. CEO-only access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'revenue_ledger'
  ) THEN
    CREATE TABLE revenue_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
      transaction_type text NOT NULL CHECK (transaction_type IN (
        'customer_payment',    -- money in from customer
        'escrow_held',         -- held in escrow
        'escrow_released',     -- released to fundi
        'commission_earned',   -- platform's cut
        'platform_fee',        -- flat fee
        'payout',              -- money out to fundi
        'refund',              -- money returned to customer
        'chargeback',          -- reversed payment
        'gateway_fee',         -- payment processor fee (M-Pesa)
        'adjustment'           -- manual CEO adjustment
      )),
      amount numeric(12,2) NOT NULL,  -- positive = credit, negative = debit
      currency text NOT NULL DEFAULT 'KES',
      -- Breakdown (CEO-only, never exposed to fundi/customer)
      customer_paid numeric(12,2),
      commission_amount numeric(12,2),
      platform_fee_amount numeric(12,2),
      fundi_payout numeric(12,2),
      gateway_fee_amount numeric(12,2),
      net_revenue numeric(12,2),  -- platform profit after gateway fees
      -- Metadata
      payment_method text,  -- 'mpesa', 'card', 'wallet'
      gateway_reference text,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      fundi_id uuid REFERENCES users(id) ON DELETE SET NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE revenue_ledger
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'adjustment' CHECK (transaction_type IN (
    'customer_payment',
    'escrow_held',
    'escrow_released',
    'commission_earned',
    'platform_fee',
    'payout',
    'refund',
    'chargeback',
    'gateway_fee',
    'adjustment'
  )),
  ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS customer_paid numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS fundi_payout numeric(12,2),
  ADD COLUMN IF NOT EXISTS gateway_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_revenue numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS gateway_reference text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fundi_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_revenue_ledger_type ON revenue_ledger(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_job ON revenue_ledger(job_id);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_date ON revenue_ledger(created_at DESC);

-- ── 3. Financial Access Control ───────────────────────────────
-- Map which roles can see which financial data.
-- Only 'super_admin' (CEO) sees everything by default.
CREATE TABLE IF NOT EXISTS financial_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type text NOT NULL CHECK (access_type IN (
    'view_revenue',           -- total revenue
    'view_commission',        -- commission amounts
    'view_profit',            -- net profit
    'view_margins',           -- profit margins
    'view_escrow',            -- escrow balances
    'view_payouts',           -- fundi payouts
    'view_refunds',           -- refunds
    'view_chargebacks',       -- chargebacks
    'view_gateway_fees',      -- payment processor fees
    'view_financial_reports', -- executive dashboards
    'view_daily_revenue',
    'view_monthly_revenue',
    'view_yearly_revenue',
    'view_profit_by_county',
    'view_profit_by_service',
    'view_profit_by_tier',
    'view_customer_ltv',
    'view_company_kpis'
  )),
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,  -- NULL = permanent
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, access_type)
);

-- ── 4. Helper function: check financial access ────────────────
-- Called by middleware to verify if a user can see financial data.
CREATE OR REPLACE FUNCTION can_view_financial(user_uuid uuid, access text)
RETURNS boolean AS $$
DECLARE
  user_role text;
  has_grant boolean;
BEGIN
  SELECT role INTO user_role FROM users WHERE id = user_uuid;

  -- Super admin (CEO) sees everything
  IF user_role = 'super_admin' OR user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Check explicit grants
  SELECT EXISTS(
    SELECT 1 FROM financial_access_grants
    WHERE user_id = user_uuid
      AND access_type = access
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) INTO has_grant;

  RETURN COALESCE(has_grant, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
