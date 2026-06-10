-- Cloudflare R2 storage metadata (never store binary in PostgreSQL)

alter table fundis add column if not exists id_number text;
alter table fundis add column if not exists profile_photo_url text;
alter table fundis add column if not exists profile_photo_thumb_url text;

create table if not exists verification_documents (
  id uuid primary key default gen_random_uuid(),
  fundi_id uuid not null references fundis(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  document_type text not null check (document_type in (
    'id_front', 'id_back', 'selfie_id', 'certificate', 'business_permit'
  )),
  storage_key text not null,
  public_url text,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  original_name text,
  width integer,
  height integer,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  unique (fundi_id, document_type)
);

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  storage_key text not null,
  public_url text not null,
  thumb_url text,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  original_name text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_documents_fundi on verification_documents(fundi_id);
create index if not exists idx_verification_documents_user on verification_documents(user_id);
create index if not exists idx_job_photos_job on job_photos(job_id, sort_order);
