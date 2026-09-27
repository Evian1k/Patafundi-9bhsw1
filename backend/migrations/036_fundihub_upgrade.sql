-- 036: FUNDIHUB production-completion upgrade
-- Covers spec §2 (three-way booking), §6 (verification levels), §8 (refund queue),
-- §20 (admin reviews/revenue), §29 (review replies), §31-32 (AI events + guardrails),
-- §7 (company subscriptions).

-- 1. Three-way booking model (spec §2): Option C — "Let FundiHub match me".
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_provider_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_provider_type_check
  CHECK (provider_type IN ('fundi', 'company', 'platform_match'));

-- Match metadata: which engine produced the offer set and its scores.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS match_metadata jsonb not null default '{}'::jsonb;

-- 2. Fundi verification levels (spec §6: admin can "change verification level").
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS verification_level text NOT NULL DEFAULT 'standard';
ALTER TABLE fundis DROP CONSTRAINT IF EXISTS fundis_verification_level_check;
ALTER TABLE fundis ADD CONSTRAINT fundis_verification_level_check
  CHECK (verification_level IN ('standard', 'enhanced', 'top_pro'));

-- 3. Refund requests (spec §8/§23): customer-facing request queue.
--    Approval/reversal remains an admin-only, audited action. The actual
--    provider-side money movement (M-Pesa reversal) is executed through the
--    configured provider workflow and recorded via the existing atomic
--    processRefund ledger path — never faked client-side.
create table if not exists refund_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  payment_id uuid references payments(id),
  customer_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  details text,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'processing', 'completed', 'cancelled')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_refund_requests_status on refund_requests(status, created_at desc);
create index if not exists idx_refund_requests_customer on refund_requests(customer_id);
create index if not exists idx_refund_requests_job on refund_requests(job_id);

-- 4. Review replies (spec §29: provider/company response to reviews).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS provider_reply text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS provider_reply_at timestamptz;
-- Review moderation (spec §20): admin can hide abusive reviews; hidden reviews
-- no longer count towards rating aggregates (handled in query layer).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hidden boolean not null default false;

-- 5. AI events (spec §31-32): every LLM interaction is logged for audit.
--    AI never performs state-changing actions; admins confirm separately.
create table if not exists ai_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  kind text not null,
  model text,
  job_id uuid references jobs(id),
  dispute_id uuid references disputes(id),
  input_summary text,
  output jsonb,
  latency_ms integer,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_events_kind_time on ai_events(kind, created_at desc);
create index if not exists idx_ai_events_user on ai_events(user_id, created_at desc);

-- 6. Company subscriptions (spec §7): companies subscribe like fundis.
--    fundi_id column historically stores the PAYING user id (company owner).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscriber_type text NOT NULL DEFAULT 'fundi';
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_subscriber_type_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_subscriber_type_check
  CHECK (subscriber_type IN ('fundi', 'company'));
