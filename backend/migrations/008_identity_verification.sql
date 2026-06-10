-- Identity verification + secure storage (R2 keys only, no public URLs)

-- User verification fields
alter table users add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'review_required', 'verified', 'rejected', 'suspended'));
alter table users add column if not exists face_match_score numeric(5, 2);
alter table users add column if not exists liveness_score numeric(5, 2);
alter table users add column if not exists fraud_risk_score numeric(5, 2);
alter table users add column if not exists verified_at timestamptz;

-- Extend verification_documents (safe column renames)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'verification_documents' and column_name = 'storage_key'
  ) then
    alter table verification_documents rename column storage_key to r2_key;
  end if;
end $$;

alter table verification_documents add column if not exists r2_key text;
alter table verification_documents add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected', 'reupload_requested'));
alter table verification_documents add column if not exists face_match_score numeric(5, 2);
alter table verification_documents add column if not exists verification_result text;
alter table verification_documents add column if not exists perceptual_hash text;
alter table verification_documents add column if not exists blur_score numeric(8, 2);
alter table verification_documents add column if not exists uploaded_by uuid references users(id);
alter table verification_documents drop column if exists public_url;

-- Job photos: private by default, signed URL access only
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'job_photos' and column_name = 'storage_key'
  ) then
    alter table job_photos rename column storage_key to r2_key;
  end if;
end $$;

alter table job_photos add column if not exists r2_key text;
alter table job_photos add column if not exists status text not null default 'active'
  check (status in ('active', 'deleted'));
alter table job_photos add column if not exists thumb_r2_key text;
alter table job_photos drop column if exists public_url;
alter table job_photos drop column if exists thumb_url;

-- Dispute evidence files
create table if not exists dispute_files (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  r2_key text not null,
  thumb_r2_key text,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  original_name text,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_dispute_files_dispute on dispute_files(dispute_id);

-- Chat attachments (private, job-scoped)
create table if not exists chat_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  message_id uuid references chat_messages(id) on delete set null,
  uploaded_by uuid not null references users(id),
  r2_key text not null,
  thumb_r2_key text,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  original_name text,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_attachments_job on chat_attachments(job_id);
create index if not exists idx_chat_attachments_message on chat_attachments(message_id);

-- Liveness verification sessions
create table if not exists liveness_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fundi_id uuid not null references fundis(id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'in_progress', 'completed', 'failed', 'expired')),
  challenges jsonb not null default '[]'::jsonb,
  frames jsonb not null default '[]'::jsonb,
  liveness_score numeric(5, 2),
  face_match_score numeric(5, 2),
  fraud_risk_score numeric(5, 2),
  verification_result text,
  anti_spoof_flags jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_liveness_sessions_user on liveness_sessions(user_id, created_at desc);

-- Document access audit (immutable)
create table if not exists document_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  document_type text not null,
  document_id uuid not null,
  action text not null default 'view',
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_access_logs_doc on document_access_logs(document_id, created_at desc);
create index if not exists idx_document_access_logs_user on document_access_logs(user_id, created_at desc);

-- Perceptual hash index for duplicate detection
create index if not exists idx_verification_documents_hash on verification_documents(perceptual_hash)
  where perceptual_hash is not null;

-- Fundi verification summary on fundis table
alter table fundis add column if not exists face_match_score numeric(5, 2);
alter table fundis add column if not exists liveness_score numeric(5, 2);
alter table fundis add column if not exists fraud_risk_score numeric(5, 2);
alter table fundis add column if not exists verification_result text;
alter table fundis add column if not exists verification_review_status text not null default 'pending'
  check (verification_review_status in ('pending', 'strong_match', 'review_required', 'suspicious', 'approved', 'rejected', 'reupload_requested'));
