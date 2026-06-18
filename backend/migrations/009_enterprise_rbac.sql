-- Migration 009: Enterprise RBAC — roles, permissions, role_permissions, user_permissions
--
-- Transforms PataFundi from a simple role-check system into a full
-- permission-based RBAC model. Existing 'admin' role is preserved as
-- a super_admin equivalent for backward compatibility.
--
-- Staff roles (separate from public platform roles):
--   super_admin     — platform owner, full access (ONLY one account)
--   admin           — operations manager (limited)
--   support_agent   — tickets + disputes only
--   fraud_analyst   — fraud dashboard + flag transactions
--   finance_team    — payments + commissions + payouts (no personal data)
--   dispatch_team   — job assignment + fundi matching
--   devops_engineer — system health + logs + deployments
--   auditor         — read-only compliance view (no mutations)

-- ============================================================
-- 1. Expand users.role to include staff roles
-- ============================================================
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in (
    -- public platform
    'customer', 'fundi_pending', 'fundi',
    -- internal staff
    'super_admin', 'admin', 'support_agent', 'fraud_analyst',
    'finance_team', 'dispatch_team', 'devops_engineer', 'auditor'
  ));

-- ============================================================
-- 2. Permissions catalog
-- ============================================================
create table if not exists permissions (
  id serial primary key,
  code text not null unique,
  description text not null,
  category text not null check (category in (
    'user_management', 'fundi_management', 'finance', 'fraud',
    'support', 'system', 'jobs', 'storage'
  )),
  is_dangerous boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed the permission catalog
insert into permissions (code, description, category, is_dangerous) values
  -- User management
  ('can_view_users', 'View user accounts', 'user_management', false),
  ('can_ban_users', 'Disable/ban user accounts', 'user_management', true),
  ('can_promote_users', 'Promote/demote user roles', 'user_management', true),
  ('can_force_logout', 'Force logout any user', 'user_management', true),
  -- Fundi management
  ('can_view_fundis', 'View fundi profiles and verification docs', 'fundi_management', false),
  ('can_approve_fundis', 'Approve/reject fundi applications', 'fundi_management', true),
  ('can_suspend_fundis', 'Suspend/reactivate fundis', 'fundi_management', true),
  ('can_request_reupload', 'Request document re-upload', 'fundi_management', false),
  ('can_freeze_wallet', 'Freeze fundi wallet/payouts', 'fundi_management', true),
  -- Finance
  ('can_view_payments', 'View payment records', 'finance', false),
  ('can_view_commissions', 'View commission ledger', 'finance', false),
  ('can_issue_refunds', 'Issue refunds to customers', 'finance', true),
  ('can_release_escrow', 'Release escrow to fundis', 'finance', true),
  ('can_complete_payouts', 'Mark payouts as completed', 'finance', true),
  ('can_view_revenue', 'View platform revenue dashboard', 'finance', false),
  -- Fraud
  ('can_view_fraud_dashboard', 'View fraud dashboard', 'fraud', false),
  ('can_flag_transactions', 'Flag transactions as fraudulent', 'fraud', true),
  ('can_resolve_alerts', 'Resolve fraud alerts', 'fraud', false),
  ('can_ban_fraud_users', 'Ban users for fraud', 'fraud', true),
  -- Support
  ('can_view_tickets', 'View support tickets', 'support', false),
  ('can_reply_tickets', 'Reply to support tickets', 'support', false),
  ('can_view_disputes', 'View disputes', 'support', false),
  ('can_resolve_disputes', 'Resolve disputes', 'support', true),
  -- Jobs
  ('can_view_all_jobs', 'View all jobs (not just own)', 'jobs', false),
  ('can_assign_jobs', 'Manually assign jobs to fundis', 'jobs', true),
  ('can_cancel_jobs', 'Cancel any job', 'jobs', true),
  -- Storage
  ('can_view_verification_documents', 'View fundi verification documents', 'storage', false),
  -- System
  ('can_view_logs', 'View audit logs', 'system', false),
  ('can_view_metrics', 'View system metrics', 'system', false),
  ('can_view_health', 'View /health subsystem status', 'system', false),
  ('can_manage_system', 'Manage system settings', 'system', true),
  ('can_manage_roles', 'Assign/revoke roles and permissions', 'system', true)
on conflict (code) do nothing;

-- ============================================================
-- 3. Role-permission mapping
-- ============================================================
create table if not exists role_permissions (
  role text not null,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role, permission_code)
);

-- Helper: grant a list of permissions to a role
insert into role_permissions (role, permission_code)
select 'super_admin', code from permissions
on conflict do nothing;

-- admin (operations manager) — everything except role management
insert into role_permissions (role, permission_code)
select 'admin', code from permissions
where code not in ('can_manage_roles', 'can_promote_users')
on conflict do nothing;

-- support_agent — tickets, disputes, view users (no finance, no fraud)
insert into role_permissions (role, permission_code) values
  ('support_agent', 'can_view_users'),
  ('support_agent', 'can_view_tickets'),
  ('support_agent', 'can_reply_tickets'),
  ('support_agent', 'can_view_disputes'),
  ('support_agent', 'can_resolve_disputes'),
  ('support_agent', 'can_view_all_jobs'),
  ('support_agent', 'can_view_fundis'),
  ('support_agent', 'can_request_reupload')
on conflict do nothing;

-- fraud_analyst — fraud dashboard + flag + resolve
insert into role_permissions (role, permission_code) values
  ('fraud_analyst', 'can_view_fraud_dashboard'),
  ('fraud_analyst', 'can_flag_transactions'),
  ('fraud_analyst', 'can_resolve_alerts'),
  ('fraud_analyst', 'can_view_users'),
  ('fraud_analyst', 'can_view_fundis'),
  ('fraud_analyst', 'can_suspend_fundis'),
  ('fraud_analyst', 'can_ban_fraud_users'),
  ('fraud_analyst', 'can_view_all_jobs')
on conflict do nothing;

-- finance_team — payments, commissions, payouts (no personal data, no fundi approval)
insert into role_permissions (role, permission_code) values
  ('finance_team', 'can_view_payments'),
  ('finance_team', 'can_view_commissions'),
  ('finance_team', 'can_issue_refunds'),
  ('finance_team', 'can_release_escrow'),
  ('finance_team', 'can_complete_payouts'),
  ('finance_team', 'can_view_revenue'),
  ('finance_team', 'can_view_all_jobs')
on conflict do nothing;

-- dispatch_team — job assignment + fundi matching
insert into role_permissions (role, permission_code) values
  ('dispatch_team', 'can_view_all_jobs'),
  ('dispatch_team', 'can_assign_jobs'),
  ('dispatch_team', 'can_view_fundis'),
  ('dispatch_team', 'can_approve_fundis'),
  ('dispatch_team', 'can_cancel_jobs')
on conflict do nothing;

-- devops_engineer — system health + logs + metrics
insert into role_permissions (role, permission_code) values
  ('devops_engineer', 'can_view_logs'),
  ('devops_engineer', 'can_view_metrics'),
  ('devops_engineer', 'can_view_health'),
  ('devops_engineer', 'can_manage_system')
on conflict do nothing;

-- auditor — read-only everything (no mutations)
insert into role_permissions (role, permission_code)
select 'auditor', code from permissions
where code like 'can_view_%' or code = 'can_view_health'
on conflict do nothing;

-- ============================================================
-- 4. User-level permission overrides (grant or deny)
-- ============================================================
create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  granted boolean not null default true, -- false = explicitly denied
  reason text,
  granted_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (user_id, permission_code)
);

create index if not exists idx_user_permissions_user on user_permissions(user_id);

-- ============================================================
-- 5. Staff login history (device + IP tracking)
-- ============================================================
create table if not exists staff_login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  success boolean not null default true,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_login_history_user on staff_login_history(user_id, created_at desc);
create index if not exists idx_staff_login_history_ip on staff_login_history(ip_address, created_at desc);

-- ============================================================
-- 6. Promote the existing seeded admin to super_admin
-- ============================================================
-- The demo admin@patafundi.com was created with role='admin' by the
-- dev seed script. Promote it to super_admin so it retains full access
-- under the new RBAC system.
update users set role = 'super_admin', updated_at = now()
where email = 'admin@patafundi.com' and role = 'admin';

-- ============================================================
-- 7. Audit log immutability trigger (already exists for audit_logs,
--    fraud_detection_events, trust_score_history). Add for staff_login_history.
-- ============================================================
create or replace function prevent_staff_login_delete()
returns trigger as $$
begin
  raise exception 'Staff login history cannot be deleted';
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_staff_login_delete on staff_login_history;
create trigger trg_prevent_staff_login_delete
  before delete on staff_login_history
  for each row execute function prevent_staff_login_delete();
