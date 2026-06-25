-- Migration 015: Device tokens for push notifications + maintenance mode enforcement

-- User device tokens for push notifications (FCM/Web Push)
create table if not exists user_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'web' check (platform in ('web', 'android', 'ios')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user on user_device_tokens(user_id, is_active);
