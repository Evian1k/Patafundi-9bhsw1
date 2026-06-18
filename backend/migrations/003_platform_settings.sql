create table if not exists platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
