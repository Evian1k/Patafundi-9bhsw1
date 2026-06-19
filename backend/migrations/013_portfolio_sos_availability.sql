-- Migration 013: Fundi portfolio + SOS emergencies + availability schedule
--
-- Phase: Portfolio gallery, SOS button, availability calendar

-- ============================================================
-- 1. Fundi Portfolio (past work gallery)
-- ============================================================
create table if not exists fundi_portfolios (
  id uuid primary key default gen_random_uuid(),
  fundi_id uuid not null references fundis(id) on delete cascade,
  user_id uuid not null references users(id),
  r2_key text not null,
  thumb_r2_key text,
  title text,
  description text,
  service_category text,
  job_id uuid references jobs(id) on delete set null,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_fundi_portfolios_fundi on fundi_portfolios(fundi_id, sort_order);

-- ============================================================
-- 2. SOS Emergencies
-- ============================================================
create table if not exists sos_emergencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('customer', 'fundi')),
  job_id uuid references jobs(id) on delete set null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  message text,
  status text not null default 'active' check (status in ('active', 'responded', 'resolved')),
  responded_by uuid references users(id),
  responded_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sos_active on sos_emergencies(status, created_at desc) where status = 'active';
create index if not exists idx_sos_user on sos_emergencies(user_id, created_at desc);

-- ============================================================
-- 3. Fundi Availability Schedule (weekly recurring)
-- ============================================================
create table if not exists fundi_availability (
  id uuid primary key default gen_random_uuid(),
  fundi_id uuid not null references fundis(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_hour integer not null check (start_hour between 0 and 23),
  end_hour integer not null check (end_hour between 0 and 23),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fundi_id, day_of_week)
);

create index if not exists idx_fundi_availability_fundi on fundi_availability(fundi_id);
