-- Migration 012: Enterprise systems — quality scores, internal notes, referrals, loyalty, escalations, SLA, commission history
--
-- Implements 7 missing systems identified by the enterprise gap analysis:
--   Phase 4: Fundi quality scores (0-100, Bronze/Silver/Gold/Platinum/Elite)
--   Phase 7: Internal notes (staff-only notes on customers/fundis/jobs/payments)
--   Phase 8: Referral system (customer + fundi referrals with reward tracking)
--   Phase 9: Loyalty system (Bronze/Silver/Gold/Platinum/Diamond tiers)
--   Phase 6: Escalation system (support → ops → finance → fraud → super_admin)
--   Phase 6: SLA management (15min/1hr/6hr/24hr targets with breach tracking)
--   Phase 3: Commission change history (audit trail of rate changes)

-- ============================================================
-- 1. Fundi Quality Scores (Phase 4)
-- ============================================================
create table if not exists fundi_quality_scores (
  fundi_id uuid primary key references fundis(id) on delete cascade,
  rating_score numeric(5, 2) not null default 0 check (rating_score between 0 and 100),
  completion_score numeric(5, 2) not null default 0 check (completion_score between 0 and 100),
  acceptance_score numeric(5, 2) not null default 0 check (acceptance_score between 0 and 100),
  cancellation_score numeric(5, 2) not null default 0 check (cancellation_score between 0 and 100),
  punctuality_score numeric(5, 2) not null default 0 check (punctuality_score between 0 and 100),
  verification_score numeric(5, 2) not null default 0 check (verification_score between 0 and 100),
  experience_score numeric(5, 2) not null default 0 check (experience_score between 0 and 100),
  complaint_score numeric(5, 2) not null default 0 check (complaint_score between 0 and 100),
  overall_score numeric(5, 2) not null default 0 check (overall_score between 0 and 100),
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum', 'elite')),
  jobs_completed integer not null default 0,
  jobs_cancelled integer not null default 0,
  jobs_accepted integer not null default 0,
  jobs_offered integer not null default 0,
  avg_response_minutes numeric(10, 2),
  avg_arrival_minutes numeric(10, 2),
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fundi_quality_tier on fundi_quality_scores(tier);
create index if not exists idx_fundi_quality_score on fundi_quality_scores(overall_score desc);

-- ============================================================
-- 2. Internal Notes (Phase 7) — staff-only notes on any entity
-- ============================================================
create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('customer', 'fundi', 'job', 'payment', 'dispute', 'support_ticket')),
  entity_id uuid not null,
  author_id uuid not null references users(id),
  note text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_internal_notes_entity on internal_notes(entity_type, entity_id, created_at desc);
create index if not exists idx_internal_notes_author on internal_notes(author_id);

-- ============================================================
-- 3. Referral System (Phase 8)
-- ============================================================
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references users(id),
  referee_id uuid not null references users(id),
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rewarded', 'expired')),
  reward_type text check (reward_type in ('wallet_credit', 'commission_discount', 'cash')),
  reward_amount numeric(12, 2) not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (referee_id),
  unique (referral_code)
);

create index if not exists idx_referrals_referrer on referrals(referrer_id);
create index if not exists idx_referrals_code on referrals(referral_code);

-- ============================================================
-- 4. Loyalty System (Phase 9)
-- ============================================================
create table if not exists user_loyalty (
  user_id uuid primary key references users(id) on delete cascade,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  points integer not null default 0,
  jobs_completed integer not null default 0,
  total_spent numeric(12, 2) not null default 0,
  tier_achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_loyalty_tier on user_loyalty(tier);

-- ============================================================
-- 5. Escalation System (Phase 6)
-- ============================================================
create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('dispute', 'support_ticket', 'job', 'fraud_alert')),
  entity_id uuid not null,
  escalated_by uuid not null references users(id),
  escalated_to_role text not null check (escalated_to_role in ('admin', 'finance_team', 'fraud_analyst', 'super_admin')),
  from_role text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'closed')),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_escalations_status on escalations(status, created_at desc);
create index if not exists idx_escalations_entity on escalations(entity_type, entity_id);

-- ============================================================
-- 6. SLA Management (Phase 6)
-- ============================================================
create table if not exists sla_tracks (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('dispute', 'support_ticket', 'job', 'fraud_alert')),
  entity_id uuid not null,
  priority text not null check (priority in ('critical', 'high', 'medium', 'low')),
  target_response_minutes integer not null,
  target_resolution_minutes integer not null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  response_breached boolean not null default false,
  resolution_breached boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sla_breaches on sla_tracks(response_breached, resolution_breached) where response_breached = true or resolution_breached = true;
create index if not exists idx_sla_entity on sla_tracks(entity_type, entity_id);

-- ============================================================
-- 7. Commission Change History (Phase 3)
-- ============================================================
create table if not exists commission_history (
  id uuid primary key default gen_random_uuid(),
  changed_by uuid not null references users(id),
  scope text not null check (scope in ('global', 'category', 'region', 'tier', 'promotion')),
  scope_value text,
  old_rate numeric(5, 4),
  new_rate numeric(5, 4),
  old_type text,
  new_type text,
  reason text,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_commission_history_scope on commission_history(scope, scope_value, created_at desc);

-- Prevent deletion of commission history (audit trail)
create or replace function prevent_commission_history_delete()
returns trigger as $$
begin
  raise exception 'Commission history cannot be deleted';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_commission_history_delete on commission_history;
create trigger trg_prevent_commission_history_delete
  before delete on commission_history
  for each row execute function prevent_commission_history_delete();
