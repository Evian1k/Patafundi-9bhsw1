-- Extend user roles for fundi onboarding flow
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('customer', 'fundi', 'fundi_pending', 'admin'));

alter table users alter column trust_score set default 100;
alter table trust_scores alter column score set default 100;

-- Job lifecycle timeline (immutable audit trail)
create table if not exists job_timeline (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  event_type text not null check (event_type in (
    'job_created', 'job_posted', 'fundi_matched', 'fundi_accepted', 'fundi_arrived',
    'work_started', 'work_completed', 'customer_confirmed', 'payment_made',
    'escrow_released', 'payout_requested', 'payout_completed', 'job_cancelled'
  )),
  actor_id uuid references users(id),
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_timeline_job on job_timeline(job_id, created_at);

-- Expected commission tracking per accepted job
create table if not exists expected_commissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id) on delete cascade,
  fundi_id uuid not null references users(id),
  customer_id uuid not null references users(id),
  job_amount numeric(12, 2) not null,
  commission_rate numeric(5, 4) not null,
  expected_commission numeric(12, 2) not null,
  payment_received boolean not null default false,
  customer_confirmed boolean not null default false,
  escrow_funded boolean not null default false,
  flagged_suspicious boolean not null default false,
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expected_commissions_flagged on expected_commissions(flagged_suspicious, created_at);

-- Commission debt recovery
create table if not exists commission_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  job_id uuid references jobs(id),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'invoiced', 'overdue', 'paid', 'deducted')),
  reason text not null,
  invoice_reference text,
  deducted_from_payout_id uuid references payouts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_commission_debts_user_status on commission_debts(user_id, status);

-- Trust score change history (never delete)
create table if not exists trust_score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  previous_score integer not null,
  new_score integer not null,
  delta integer not null,
  reason text not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_trust_score_history_user on trust_score_history(user_id, created_at desc);

-- Per-user AI fraud risk score (0-100)
create table if not exists user_fraud_scores (
  user_id uuid primary key references users(id) on delete cascade,
  fraud_score integer not null default 0 check (fraud_score between 0 and 100),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  detection_count integer not null default 0,
  last_detection_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Detailed fraud detection events (immutable)
create table if not exists fraud_detection_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  job_id uuid references jobs(id),
  event_type text not null,
  source text not null check (source in ('chat', 'job_notes', 'review', 'dispute', 'pattern', 'commission', 'admin')),
  pattern_type text,
  score_delta integer not null default 0,
  fraud_score_after integer,
  content_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_fraud_detection_events_user on fraud_detection_events(user_id, created_at desc);
create index if not exists idx_fraud_detection_events_job on fraud_detection_events(job_id, created_at desc);

-- M-Pesa webhook replay protection
create table if not exists processed_webhook_callbacks (
  id uuid primary key default gen_random_uuid(),
  checkout_request_id text not null unique,
  mpesa_receipt_number text unique,
  payment_id uuid references payments(id),
  callback_hash text not null unique,
  processed_at timestamptz not null default now()
);

-- Job completion OTP brute-force protection
alter table jobs add column if not exists completion_otp_attempts integer not null default 0;
alter table jobs add column if not exists completion_otp_locked_until timestamptz;

-- Extend fraud alerts for admin workflow
alter table fraud_alerts add column if not exists fraud_score integer;
alter table fraud_alerts add column if not exists status text not null default 'open'
  check (status in ('open', 'warned', 'resolved', 'escalated'));
alter table fraud_alerts add column if not exists action_taken text;

-- Prevent audit log deletion
create or replace function prevent_audit_log_delete()
returns trigger as $$
begin
  raise exception 'Audit logs cannot be deleted';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_audit_delete on audit_logs;
create trigger trg_prevent_audit_delete
  before delete on audit_logs
  for each row execute function prevent_audit_log_delete();

drop trigger if exists trg_prevent_fraud_event_delete on fraud_detection_events;
create trigger trg_prevent_fraud_event_delete
  before delete on fraud_detection_events
  for each row execute function prevent_audit_log_delete();

drop trigger if exists trg_prevent_trust_history_delete on trust_score_history;
create trigger trg_prevent_trust_history_delete
  before delete on trust_score_history
  for each row execute function prevent_audit_log_delete();

-- Seed fraud scores for existing users
insert into user_fraud_scores (user_id, fraud_score, risk_level)
select id, 0, 'low' from users
on conflict (user_id) do nothing;
