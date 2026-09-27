-- 038: Fundi job offers — persistent record of broadcast offers (spec §23/§26).
-- Replaces the previous stateless broadcast: offers are now queryable, so
-- "new requests" tiles, decline actions and response-rate metrics are real
-- database values instead of hardcoded zeros.
create table if not exists fundi_job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  fundi_id uuid not null references users(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined', 'expired')),
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (job_id, fundi_id)
);

create index if not exists idx_fundi_job_offers_fundi
  on fundi_job_offers(fundi_id, response, offered_at desc);
create index if not exists idx_fundi_job_offers_job
  on fundi_job_offers(job_id);
