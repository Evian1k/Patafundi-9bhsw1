-- Migration 010: AI Command Center — audit log for AI recommendations
--
-- The AI system is advisory only. It NEVER performs actions.
-- Every recommendation is logged here so super_admin can review
-- what the AI suggested, when, and what action was taken (if any).

create table if not exists ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'fundi_verification', 'fraud_detection', 'revenue', 'commission',
    'staff_performance', 'customer_experience', 'platform_health', 'growth'
  )),
  severity text not null default 'info' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  recommendation text not null,
  confidence numeric(5, 2) not null default 0 check (confidence between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  affected_user_id uuid references users(id),
  affected_job_id uuid references jobs(id),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  action_taken text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_recommendations_status on ai_recommendations(status, created_at desc);
create index if not exists idx_ai_recommendations_category on ai_recommendations(category, created_at desc);
create index if not exists idx_ai_recommendations_severity on ai_recommendations(severity) where status = 'pending';

-- Prevent deletion of AI recommendations (tamper-evident)
create or replace function prevent_ai_recommendation_delete()
returns trigger as $$
begin
  raise exception 'AI recommendations cannot be deleted';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_ai_recommendation_delete on ai_recommendations;
create trigger trg_prevent_ai_recommendation_delete
  before delete on ai_recommendations
  for each row execute function prevent_ai_recommendation_delete();
