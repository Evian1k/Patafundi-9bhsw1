-- ============================================================
-- 039 — Master-prompt completion pass:
--   A. Company payout execution (settlements → real withdrawal requests
--      → admin payout completion), with payout destinations.
--   B. Granular company-member capability matrix (per-member permissions).
--   C. Globalization surfacing helpers (currency on payouts, indexes).
-- ============================================================

-- ── A1. payouts: support company payouts (fundi_id becomes nullable,
--         exactly one of fundi_id / company_id must be present) ──
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company_profiles(id) ON DELETE CASCADE;
ALTER TABLE payouts ALTER COLUMN fundi_id DROP NOT NULL;
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_provider_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_provider_check
  CHECK ((fundi_id IS NOT NULL AND company_id IS NULL) OR (company_id IS NOT NULL AND fundi_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_payouts_company ON payouts(company_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status_created ON payouts(status, created_at);

-- ── A2. company_profiles: payout destination (server-side, never client-trusted) ──
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS payout_method text NOT NULL DEFAULT 'mpesa'
  CHECK (payout_method IN ('mpesa', 'bank'));
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS payout_mpesa_number text;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS payout_bank_name text;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS payout_bank_account text;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS payout_account_name text;

-- ── B. company_members: explicit capability overrides (jsonb array of keys).
--         NULL = use the role's default capability matrix (see companyAccess.js).
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS permissions jsonb;

-- ── C. payouts carry the settlement currency explicitly ──
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';

-- Staff-facing notification type used by payout completion (no-op guard for
-- older DBs where the enum-free column accepts any text).
CREATE INDEX IF NOT EXISTS idx_company_settlements_status ON company_settlements(company_id, status);
