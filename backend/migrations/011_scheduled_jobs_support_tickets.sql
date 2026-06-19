-- Migration 011: Scheduled jobs + support ticket updates column
--
-- Fixes:
-- C7: Scheduled jobs captured in UI but never persisted to DB
-- C19: Support tickets need updated_at column for status changes

-- Add scheduled_at to jobs (nullable — only set for future jobs)
alter table jobs add column if not exists scheduled_at timestamptz;

-- Add updated_at to support_tickets (for status tracking)
alter table support_tickets add column if not exists updated_at timestamptz not null default now();

-- Add internal_notes to support_tickets (staff-only notes invisible to customers)
alter table support_tickets add column if not exists internal_notes text;

-- Add assigned_to to support_tickets (which staff member is handling this)
alter table support_tickets add column if not exists assigned_to uuid references users(id);

-- Expand support_tickets status check constraint
alter table support_tickets drop constraint if exists support_tickets_status_check;
alter table support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'resolved', 'closed'));

-- Index for scheduled job queries
create index if not exists idx_jobs_scheduled on jobs(scheduled_at) where scheduled_at is not null;

-- Index for support ticket status queries
create index if not exists idx_support_tickets_status on support_tickets(status, created_at desc);
