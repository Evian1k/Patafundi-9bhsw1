-- ============================================================
-- Migration 017: Referral System Rework — Discount Vouchers
-- ============================================================
-- Business rules:
--   • Referral rewards are DISCOUNT VOUCHERS ONLY (no cash, no wallet credit)
--   • 2% discount on next job, max KES 500
--   • Single-use, expires after 30 days, cannot stack/transfer/withdraw
--   • Referrer gets voucher only AFTER referee completes first paid job
--   • Fraud checks: block self-referrals, duplicate email/phone/device/IP
--   • Sunday campaigns: super_admin can activate boosted campaigns (3%, 5%)
-- ============================================================

-- ============================================================
-- 1. referral_campaigns — super-admin-controlled campaigns
-- ============================================================
create table if not exists referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  -- 'standard' = always-on 2% campaign
  -- 'sunday' = special campaign (Referral Sunday with boosted %)
  campaign_type text not null default 'standard' check (campaign_type in ('standard', 'sunday', 'promo')),
  -- Discount percentage (2 = 2%, 3 = 3%, 5 = 5%)
  discount_percentage numeric(5,2) not null default 2.00 check (discount_percentage between 0 and 100),
  -- Maximum discount cap per voucher in KES
  max_discount_kes numeric(12,2) not null default 500.00,
  -- Voucher validity in days from issuance
  voucher_validity_days integer not null default 30,
  -- Minimum job value (KES) required for referee to trigger voucher
  min_job_value_kes numeric(12,2) not null default 500.00,
  -- Campaign lifecycle
  status text not null default 'active' check (status in ('active', 'paused', 'disabled', 'expired')),
  -- Scheduling (for sunday/promo campaigns)
  start_date timestamptz,
  end_date timestamptz,
  -- Caps
  max_redemptions integer, -- null = unlimited
  redemptions_count integer not null default 0,
  -- Audit
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_scheduled_campaigns_have_dates
    check (campaign_type = 'standard' or (start_date is not null and end_date is not null)),
  constraint chk_end_after_start
    check (end_date is null or start_date is null or end_date > start_date),
  constraint chk_max_redemptions_positive
    check (max_redemptions is null or max_redemptions > 0)
);

create index if not exists idx_referral_campaigns_status on referral_campaigns(status);
create index if not exists idx_referral_campaigns_type on referral_campaigns(campaign_type);
create index if not exists idx_referral_campaigns_dates on referral_campaigns(start_date, end_date);

-- ============================================================
-- 2. referrals — tracks each referral relationship
-- ============================================================
-- Drop the old table structure from migration 012 and replace with the new model.
-- The old table had reward_type='wallet_credit'/'cash' which is now FORBIDDEN.
-- We preserve existing referral rows by migrating them to the new schema.

-- Add new columns to existing referrals table (additive — no destructive changes)
alter table referrals
  add column if not exists campaign_id uuid references referral_campaigns(id),
  add column if not exists referee_email_verified boolean not null default false,
  add column if not exists referee_phone_verified boolean not null default false,
  add column if not exists referee_first_job_id uuid,
  add column if not exists referee_first_job_completed_at timestamptz,
  add column if not exists voucher_issued_at timestamptz,
  add column if not exists fraud_check_passed boolean not null default false,
  add column if not exists fraud_check_reason text,
  add column if not exists ip_address text,
  add column if not exists device_fingerprint text,
  add column if not exists blocked_reason text;

-- Enforce the new business rule: reward_type can ONLY be 'discount_voucher'
-- (we add a check constraint that rejects cash/wallet_credit for new rows)
alter table referrals
  drop constraint if exists chk_referrals_reward_type_v2;
alter table referrals
  add constraint chk_referrals_reward_type_v2
    check (reward_type is null or reward_type = 'discount_voucher');

-- Update existing rows: any old cash/wallet_credit referrals get marked as expired
-- (we do NOT delete them — audit trail must be preserved)
update referrals
  set status = 'expired',
      blocked_reason = 'Legacy cash reward — reworked to voucher system'
where reward_type in ('cash', 'wallet_credit')
  and status not in ('expired');

create index if not exists idx_referrals_campaign on referrals(campaign_id);
create index if not exists idx_referrals_status on referrals(status);
create index if not exists idx_referrals_blocked on referrals(blocked_reason) where blocked_reason is not null;
create index if not exists idx_referrals_fraud_check on referrals(fraud_check_passed) where fraud_check_passed = false;
create index if not exists idx_referrals_device_ip on referrals(device_fingerprint, ip_address);

-- ============================================================
-- 3. referral_rewards — vouchers issued to referrers
-- ============================================================
create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  -- The referrer who earned this voucher
  user_id uuid not null references users(id) on delete cascade,
  -- The referral that triggered this voucher
  referral_id uuid not null references referrals(id) on delete cascade,
  -- The campaign that defined the discount
  campaign_id uuid not null references referral_campaigns(id),
  -- Voucher code (unique, shareable but bound to user_id)
  voucher_code text not null unique,
  -- Discount details (snapshot from campaign at issuance time — immutable)
  discount_percentage numeric(5,2) not null,
  max_discount_kes numeric(12,2) not null,
  -- Lifecycle
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null, -- issued_at + voucher_validity_days
  redeemed_at timestamptz,
  redeemed_on_job_id uuid, -- references jobs(id) — left without FK to avoid migration coupling
  -- Discount actually applied at redemption (for audit)
  discount_applied_kes numeric(12,2) default 0,
  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One voucher per referral (a referral can only yield ONE reward)
  constraint uk_referral_rewards_one_per_referral unique (referral_id),
  -- Active vouchers can only have one redemption
  constraint chk_referral_rewards_redeemed_consistent
    check (
      (status = 'redeemed' and redeemed_at is not null and redeemed_on_job_id is not null)
      or (status <> 'redeemed' and redeemed_at is null)
    )
);

create index if not exists idx_referral_rewards_user on referral_rewards(user_id);
create index if not exists idx_referral_rewards_status on referral_rewards(status);
create index if not exists idx_referral_rewards_expires on referral_rewards(expires_at) where status = 'active';
create index if not exists idx_referral_rewards_code on referral_rewards(voucher_code);

-- ============================================================
-- 4. referral_redemptions — audit log of every voucher usage attempt
-- ============================================================
create table if not exists referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references referral_rewards(id) on delete cascade,
  job_id uuid not null, -- references jobs(id) — no FK to avoid coupling
  user_id uuid not null references users(id) on delete cascade,
  -- Discount calculated at redemption attempt time
  original_job_price numeric(12,2) not null,
  discount_percentage numeric(5,2) not null,
  discount_calculated_kes numeric(12,2) not null,
  discount_capped_kes numeric(12,2) not null,
  discount_applied_kes numeric(12,2) not null,
  -- Result
  status text not null check (status in ('applied', 'rejected_expired', 'rejected_already_used', 'rejected_not_owner', 'rejected_min_price', 'rejected_stacked_discount')),
  reason text,
  redeemed_at timestamptz not null default now(),
  ip_address text
);

create index if not exists idx_referral_redemptions_reward on referral_redemptions(reward_id);
create index if not exists idx_referral_redemptions_job on referral_redemptions(job_id);
create index if not exists idx_referral_redemptions_user on referral_redemptions(user_id);
create index if not exists idx_referral_redemptions_status on referral_redemptions(status);

-- ============================================================
-- 5. referral_fraud_events — tracks every blocked referral attempt
-- ============================================================
create table if not exists referral_fraud_events (
  id uuid primary key default gen_random_uuid(),
  -- The referral attempt that was blocked (nullable if blocked before referral row created)
  referral_id uuid references referrals(id) on delete set null,
  -- The user who attempted the fraudulent referral
  attempted_by uuid references users(id) on delete set null,
  -- Fraud type
  fraud_type text not null check (fraud_type in (
    'self_referral',
    'duplicate_email',
    'duplicate_phone',
    'duplicate_device',
    'duplicate_ip',
    'mass_account_creation',
    'fake_registration',
    'phone_not_verified',
    'email_not_verified',
    'job_below_minimum',
    'job_not_completed',
    'campaign_expired',
    'campaign_paused',
    'campaign_max_reached',
    'voucher_expired',
    'voucher_already_used',
    'voucher_not_owner',
    'voucher_stacked_discount',
    'suspicious_pattern'
  )),
  -- Details
  details jsonb,
  ip_address text,
  device_fingerprint text,
  -- Action taken
  action_taken text not null default 'blocked' check (action_taken in ('blocked', 'flagged', 'reviewed')),
  -- Review
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_notes text,
  review_status text default 'pending' check (review_status in ('pending', 'confirmed_fraud', 'false_positive')),
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_fraud_type on referral_fraud_events(fraud_type);
create index if not exists idx_referral_fraud_attempted_by on referral_fraud_events(attempted_by);
create index if not exists idx_referral_fraud_status on referral_fraud_events(review_status);
create index if not exists idx_referral_fraud_ip_device on referral_fraud_events(ip_address, device_fingerprint);
create index if not exists idx_referral_fraud_created on referral_fraud_events(created_at);

-- ============================================================
-- 6. user_referral_codes — each user has a stable referral code
-- ============================================================
-- (separate from referrals table so users can have a code even before referring anyone)
create table if not exists user_referral_codes (
  user_id uuid primary key references users(id) on delete cascade,
  referral_code text not null unique,
  -- Track how many times this code has been used
  total_shares integer not null default 0,
  total_signups integer not null default 0,
  total_completed integer not null default 0,
  total_vouchers_earned integer not null default 0,
  total_vouchers_redeemed integer not null default 0,
  total_savings_kes numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_referral_codes_code on user_referral_codes(referral_code);

-- ============================================================
-- 7. Add permissions for referral campaign management
-- ============================================================
insert into permissions (code, description, category) values
  ('can_manage_referral_campaigns', 'Create, pause, disable, and view referral campaigns', 'system'),
  ('can_view_referral_analytics', 'View referral analytics, fraud events, top referrers', 'system'),
  ('can_review_referral_fraud', 'Review and resolve flagged referral fraud events', 'fraud')
on conflict (code) do nothing;

-- Grant referral permissions to super_admin and admin
insert into role_permissions (role, permission_code)
select 'super_admin', p.code from permissions p
where p.code in ('can_manage_referral_campaigns', 'can_view_referral_analytics', 'can_review_referral_fraud')
on conflict do nothing;

insert into role_permissions (role, permission_code)
select 'admin', p.code from permissions p
where p.code in ('can_view_referral_analytics')
on conflict do nothing;

insert into role_permissions (role, permission_code)
select 'finance_team', p.code from permissions p
where p.code in ('can_view_referral_analytics')
on conflict do nothing;

insert into role_permissions (role, permission_code)
select 'fraud_analyst', p.code from permissions p
where p.code in ('can_view_referral_analytics', 'can_review_referral_fraud')
on conflict do nothing;

-- ============================================================
-- 8. Insert default standard campaign (always-on 2% discount)
-- ============================================================
insert into referral_campaigns (name, slug, description, campaign_type, discount_percentage, max_discount_kes, voucher_validity_days, min_job_value_kes, status)
values (
  'Standard Referral Program',
  'standard',
  'Always-on 2% discount voucher for referrers. Voucher valid 30 days, max KES 500 discount.',
  'standard',
  2.00,
  500.00,
  30,
  500.00,
  'active'
)
on conflict (slug) do nothing;

-- ============================================================
-- 9. Add updated_at triggers
-- ============================================================
create or replace function trg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_referral_campaigns_updated on referral_campaigns;
create trigger trg_referral_campaigns_updated
  before update on referral_campaigns
  for each row execute function trg_set_updated_at();

drop trigger if exists trg_referral_rewards_updated on referral_rewards;
create trigger trg_referral_rewards_updated
  before update on referral_rewards
  for each row execute function trg_set_updated_at();

drop trigger if exists trg_user_referral_codes_updated on user_referral_codes;
create trigger trg_user_referral_codes_updated
  before update on user_referral_codes
  for each row execute function trg_set_updated_at();

-- ============================================================
-- 10. Migrate existing referral rows (legacy)
-- ============================================================
-- Any existing referrals with status='rewarded' had cash rewards.
-- Mark them as legacy and do not issue vouchers retroactively.
-- (Cannot reverse already-paid cash rewards — they are historical fact.)
update referrals
  set blocked_reason = coalesce(blocked_reason, 'Legacy referral — cash reward already paid (pre-rework)')
where status = 'rewarded'
  and reward_type in ('cash', 'wallet_credit');

-- ============================================================
-- Done. New referral flow:
--   1. User gets referral_code via POST /api/referrals/code
--   2. New user registers with referralCode → referral row created (status=pending)
--   3. New user verifies email + phone
--   4. New user creates + completes first paid job (min KES 500)
--   5. Backend runs fraud checks → if pass, issue voucher to referrer
--   6. Referrer sees voucher in dashboard (active for 30 days)
--   7. Referrer creates next job → voucher auto-applied at checkout
--   8. Voucher marked as redeemed (single-use)
-- ============================================================
