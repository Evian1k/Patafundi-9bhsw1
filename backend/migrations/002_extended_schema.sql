-- Extended schema: customers, wallets, escrow accounts, chat, admin actions, job status history

create table if not exists customers (
  user_id uuid primary key references users(id) on delete cascade,
  default_location_name text,
  created_at timestamptz not null default now()
);

create table if not exists wallets (
  user_id uuid primary key references users(id) on delete cascade,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  currency text not null default 'KES',
  updated_at timestamptz not null default now()
);

create table if not exists escrow_accounts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id) on delete cascade,
  customer_id uuid not null references users(id),
  fundi_id uuid references users(id),
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  status text not null default 'pending' check (status in ('pending', 'escrow_held', 'completion_requested', 'customer_confirmed', 'payout_processing', 'payout_completed', 'frozen', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_status_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null,
  actor_id uuid references users(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null,
  image_url text,
  read_at timestamptz,
  bypass_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users(id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_job on chat_messages(job_id, created_at);
create index if not exists idx_job_status_updates_job on job_status_updates(job_id, created_at desc);
create index if not exists idx_escrow_accounts_status on escrow_accounts(status);
create index if not exists idx_admin_actions_admin on admin_actions(admin_id, created_at desc);
