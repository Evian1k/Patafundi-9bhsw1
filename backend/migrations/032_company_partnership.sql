create extension if not exists pgcrypto;

create table if not exists company_partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_name text not null,
  legal_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  company_registration_number text,
  business_categories text[] not null default array[]::text[],
  service_areas text[] not null default array[]::text[],
  branches jsonb not null default '[]'::jsonb,
  technician_count integer not null default 0,
  license_details text,
  description text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'approved', 'rejected', 'archived')),
  review_notes text,
  reviewed_by_user_id uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_profiles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references company_partner_applications(id) on delete set null,
  owner_user_id uuid not null references users(id) on delete cascade,
  company_name text not null,
  legal_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  registration_number text,
  business_categories text[] not null default array[]::text[],
  service_areas text[] not null default array[]::text[],
  branches jsonb not null default '[]'::jsonb,
  technician_count integer not null default 0,
  license_details text,
  description text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'suspended', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company_profiles(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'technician' check (role in ('owner', 'manager', 'admin', 'technician')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);

alter table jobs
  add column if not exists company_id uuid references company_profiles(id) on delete set null,
  add column if not exists technician_user_id uuid references users(id),
  add column if not exists assigned_by uuid references users(id),
  add column if not exists company_job_ref text;

create index if not exists idx_jobs_company_id on jobs(company_id);
create index if not exists idx_company_members_company on company_members(company_id);
create index if not exists idx_company_members_user on company_members(user_id);
create index if not exists idx_company_partner_applications_user on company_partner_applications(user_id);
