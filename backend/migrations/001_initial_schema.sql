create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  phone text,
  role text not null check (role in ('customer', 'fundi', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  trust_score integer not null default 75 check (trust_score between 0 and 100),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  code_hash text not null,
  attempts integer not null default 0,
  locked_until timestamptz,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists fundis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  skills text[] not null default array[]::text[],
  experience text,
  bio text,
  mpesa_number text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason text,
  approved_at timestamptz,
  online boolean not null default false,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_accuracy numeric,
  rating numeric(3, 2) not null default 0,
  trust_score integer not null default 75,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references users(id),
  fundi_id uuid references users(id),
  service_category text not null,
  description text not null,
  location_name text,
  customer_latitude numeric(10, 7),
  customer_longitude numeric(10, 7),
  fundi_latitude numeric(10, 7),
  fundi_longitude numeric(10, 7),
  urgency text not null default 'normal',
  status text not null default 'pending' check (status in ('pending', 'matching', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'failed')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'escrow_held', 'completion_requested', 'otp_verified', 'customer_confirmed', 'payout_processing', 'payout_completed', 'failed')),
  escrow_status text not null default 'none' check (escrow_status in ('none', 'pending', 'held', 'frozen', 'released', 'refunded', 'completion_requested')),
  estimated_price numeric(12, 2),
  final_price numeric(12, 2),
  completion_otp_hash text,
  customer_completion_confirmed boolean not null default false,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  customer_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'KES',
  provider text not null default 'mpesa',
  mpesa_number text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  escrow_status text not null default 'pending' check (escrow_status in ('pending', 'held', 'frozen', 'released', 'refunded')),
  idempotency_key text not null unique,
  checkout_request_id text unique,
  merchant_request_id text,
  mpesa_receipt_number text unique,
  failure_reason text,
  provider_response jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  payment_id uuid not null references payments(id),
  type text not null check (type in ('hold', 'release', 'refund', 'freeze')),
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null check (status in ('pending', 'held', 'released', 'refunded', 'frozen')),
  created_at timestamptz not null default now()
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  fundi_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  mpesa_number text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed', 'cancelled')),
  provider_reference text unique,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id),
  reviewer_id uuid not null references users(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  opened_by uuid not null references users(id),
  reason text not null,
  evidence_urls text[] not null default array[]::text[],
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'rejected')),
  resolution text,
  refund_amount numeric(12, 2) not null default 0,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  sender_id uuid not null references users(id),
  body text not null,
  bypass_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists trust_scores (
  user_id uuid primary key references users(id) on delete cascade,
  score integer not null default 75 check (score between 0 and 100),
  level text not null default 'standard',
  updated_at timestamptz not null default now()
);

create table if not exists fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  user_id uuid references users(id),
  user_role text,
  alert_type text not null,
  detected_pattern text,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  message_preview text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists gps_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  fundi_id uuid not null references users(id),
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  accuracy numeric,
  created_at timestamptz not null default now()
);

create table if not exists saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null default 'other',
  address text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  subject text,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_customer on jobs(customer_id);
create index if not exists idx_jobs_fundi on jobs(fundi_id);
create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_payments_job on payments(job_id);
create index if not exists idx_payments_checkout on payments(checkout_request_id);
create index if not exists idx_escrow_job on escrow_transactions(job_id);
create index if not exists idx_payouts_fundi on payouts(fundi_id);
create index if not exists idx_disputes_status on disputes(status);
create index if not exists idx_messages_job on messages(job_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_fraud_alerts_severity on fraud_alerts(severity);
create index if not exists idx_gps_history_job_created on gps_history(job_id, created_at desc);
