alter table payments add column if not exists commission_rate numeric(5, 4) not null default 0.10;
alter table payments add column if not exists commission_type text not null default 'percentage';
alter table payments add column if not exists platform_commission numeric(12, 2) not null default 0;
alter table payments add column if not exists fundi_amount numeric(12, 2) not null default 0;
alter table payments add column if not exists commission_details jsonb not null default '{}'::jsonb;

alter table payouts add column if not exists withdrawal_fee numeric(12, 2) not null default 0;
alter table payouts add column if not exists net_amount numeric(12, 2);
alter table payouts add column if not exists protection_snapshot jsonb not null default '{}'::jsonb;

alter table fundis add column if not exists subscription_active boolean not null default false;
alter table fundis add column if not exists subscription_expires_at timestamptz;
alter table fundis add column if not exists premium_plan text;
alter table fundis add column if not exists featured_until timestamptz;
alter table fundis add column if not exists verification_badge boolean not null default false;
alter table fundis add column if not exists payout_frozen boolean not null default false;
alter table fundis add column if not exists wallet_frozen boolean not null default false;

create table if not exists revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id),
  payout_id uuid references payouts(id),
  job_id uuid references jobs(id),
  user_id uuid references users(id),
  entry_type text not null check (entry_type in ('commission', 'withdrawal_fee', 'subscription', 'refund', 'adjustment')),
  amount numeric(12, 2) not null,
  currency text not null default 'KES',
  period_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists accounting_ledger (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid,
  debit_account text not null,
  credit_account text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'KES',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  job_id uuid references jobs(id),
  violation_type text not null,
  level integer not null check (level between 1 and 4),
  penalty_amount numeric(12, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'resolved', 'waived')),
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  fundi_id uuid not null references users(id),
  plan text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_revenue_ledger_period on revenue_ledger(period_date, entry_type);
create index if not exists idx_revenue_ledger_payment on revenue_ledger(payment_id);
create index if not exists idx_accounting_ledger_source on accounting_ledger(source_type, source_id);
create index if not exists idx_violations_user on violations(user_id, status);
