-- Migration 014: 2FA, account lockout, feature flags, favorite fundis, API integrations config
--
-- Implements: TOTP 2FA, failed login tracking, feature flags, favorite fundis

-- ============================================================
-- 1. 2FA / TOTP for staff
-- ============================================================
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled boolean not null default false;
alter table users add column if not exists totp_recovery_codes jsonb not null default '[]'::jsonb;

-- ============================================================
-- 2. Account lockout tracking
-- ============================================================
alter table users add column if not exists failed_login_attempts integer not null default 0;
alter table users add column if not exists locked_until timestamptz;
alter table users add column if not exists last_failed_login_at timestamptz;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists last_login_ip text;

-- ============================================================
-- 3. Feature flags
-- ============================================================
create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  is_enabled boolean not null default true,
  category text not null default 'general' check (category in (
    'general', 'payments', 'maps', 'ai', 'chat', 'referrals',
    'loyalty', 'notifications', 'tracking', 'maintenance', 'security'
  )),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into feature_flags (key, label, is_enabled, category) values
  ('payments', 'M-Pesa Payments', true, 'payments'),
  ('maps', 'Google Maps / OSM', true, 'maps'),
  ('ai', 'AI Command Center', true, 'ai'),
  ('chat', 'In-App Chat', true, 'chat'),
  ('referrals', 'Referral Program', true, 'referrals'),
  ('loyalty', 'Loyalty Program', true, 'loyalty'),
  ('notifications', 'Push Notifications', false, 'notifications'),
  ('tracking', 'Live GPS Tracking', true, 'tracking'),
  ('maintenance_mode', 'Maintenance Mode', false, 'maintenance'),
  ('sms', 'SMS Notifications', false, 'security'),
  ('totp_required', 'Force 2FA for Super Admin', false, 'security')
on conflict (key) do nothing;

-- ============================================================
-- 4. Favorite / Saved Fundis
-- ============================================================
create table if not exists favorite_fundis (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references users(id) on delete cascade,
  fundi_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, fundi_id)
);

create index if not exists idx_favorite_fundis_customer on favorite_fundis(customer_id);

-- ============================================================
-- 5. API Integration Config (stores connection status, not secrets)
-- ============================================================
create table if not exists api_integrations (
  id uuid primary key default gen_random_uuid(),
  service text not null unique check (service in (
    'google_maps', 'daraja', 'resend', 'cloudflare_r2', 'redis',
    'firebase', 'gemini', 'openai', 'claude', 'stripe',
    'twilio', 'africas_talking', 'smtp', 'socket_io'
  )),
  label text not null,
  is_configured boolean not null default false,
  is_connected boolean not null default false,
  last_health_check timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into api_integrations (service, label, is_configured) values
  ('google_maps', 'Google Maps API', false),
  ('daraja', 'M-Pesa Daraja', false),
  ('resend', 'Resend Email', false),
  ('cloudflare_r2', 'Cloudflare R2 Storage', false),
  ('redis', 'Redis Cache', false),
  ('firebase', 'Firebase Push', false),
  ('gemini', 'Google Gemini AI', false),
  ('openai', 'OpenAI', false),
  ('claude', 'Anthropic Claude', false),
  ('stripe', 'Stripe Payments', false),
  ('twilio', 'Twilio SMS', false),
  ('africas_talking', 'Africa''s Talking SMS', false),
  ('smtp', 'SMTP Email', false),
  ('socket_io', 'Socket.IO Realtime', true)
on conflict (service) do nothing;
