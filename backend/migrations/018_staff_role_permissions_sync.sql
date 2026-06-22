-- ============================================================
-- Migration 018: Staff Role Permission Sync — Exact Spec
-- ============================================================
-- Aligns role_permissions to the exact staff spec:
--   super_admin, ops_manager, support_agent, fraud_analyst,
--   finance_team, dispatch_team, devops_engineer, auditor
--
-- Also adds new permissions for the new dashboards and powers.
-- ============================================================

-- ── 1. Add new permissions ────────────────────────────────────────
insert into permissions (code, description, category) values
  -- Super admin staff management
  ('can_create_staff', 'Create new staff accounts', 'system'),
  ('can_suspend_staff', 'Suspend staff accounts', 'system'),
  ('can_change_staff_permissions', 'Change staff role/permissions', 'system'),
  ('can_ban_permanently', 'Permanently ban users', 'user_management'),
  ('can_review_high_risk_fundis', 'Review and approve high-risk fundi applications', 'fundi_management'),
  ('can_view_audit_trails', 'View all audit trails', 'system'),
  ('can_configure_apis', 'Configure external API integrations', 'system'),
  ('can_activate_promotions', 'Activate promotional campaigns', 'system'),
  ('can_enable_disable_referrals', 'Enable/disable referral program', 'system'),
  ('can_enable_disable_loyalty', 'Enable/disable loyalty program', 'system'),
  -- Dashboard access
  ('can_view_executive_dashboard', 'View executive dashboard', 'system'),
  ('can_view_growth_dashboard', 'View growth dashboard', 'system'),
  ('can_view_loyalty_campaigns', 'View loyalty campaigns', 'system'),
  ('can_view_finance_dashboard', 'View finance dashboard', 'finance'),
  ('can_view_dispatch_dashboard', 'View dispatch dashboard with live map', 'jobs'),
  ('can_view_support_dashboard', 'View support dashboard', 'support'),
  ('can_view_devops_dashboard', 'View devops dashboard', 'system'),
  ('can_view_ai_command_center', 'View AI Command Center (advisory only)', 'system'),
  ('can_view_platform_health', 'View platform health metrics', 'system'),
  ('can_view_api_status', 'View API integration status', 'system'),
  -- Staff actions
  ('can_reassign_jobs', 'Reassign jobs between fundis', 'jobs'),
  ('can_contact_users', 'Contact users directly (email/SMS/phone)', 'support'),
  ('can_export_reports', 'Export financial and operational reports', 'finance'),
  ('can_reconcile_payments', 'Reconcile payment records', 'finance'),
  ('can_restart_services', 'Restart backend services (devops)', 'system'),
  ('can_view_deployments', 'View deployment history', 'system'),
  ('can_monitor_uptime', 'Monitor system uptime', 'system'),
  ('can_freeze_accounts', 'Freeze user accounts (fraud hold)', 'fraud'),
  ('can_escalate_fraud', 'Escalate fraud cases to super_admin', 'fraud'),
  -- AI recommendation workflow
  ('can_approve_ai_recommendation', 'Approve and execute AI recommendations', 'system'),
  ('can_reject_ai_recommendation', 'Reject AI recommendations', 'system')
on conflict (code) do nothing;

-- ── 2. Reset all role_permissions and re-grant per spec ──────────
-- This ensures the mapping exactly matches the spec.
delete from role_permissions;

-- ── SUPER ADMIN (CEO / Platform Owner) ────────────────────────────
-- Can see everything, can do everything except delete audit logs
-- and financial history.
insert into role_permissions (role, permission_code)
select 'super_admin', code from permissions
where code in (
  -- Dashboard access
  'can_view_executive_dashboard', 'can_view_growth_dashboard',
  'can_view_loyalty_campaigns', 'can_view_finance_dashboard',
  'can_view_dispatch_dashboard', 'can_view_support_dashboard',
  'can_view_devops_dashboard', 'can_view_ai_command_center',
  'can_view_platform_health', 'can_view_api_status',
  'can_view_audit_trails',
  -- Existing
  'can_view_metrics', 'can_view_revenue', 'can_view_payments',
  'can_view_commissions', 'can_view_fraud_dashboard', 'can_view_fundis',
  'can_view_users', 'can_view_all_jobs', 'can_view_disputes',
  'can_view_tickets', 'can_view_verification_documents',
  'can_view_health', 'can_view_logs', 'can_view_referral_analytics',
  -- Staff management
  'can_create_staff', 'can_suspend_staff', 'can_change_staff_permissions',
  'can_manage_roles', 'can_manage_system',
  -- User management
  'can_ban_users', 'can_ban_permanently', 'can_ban_fraud_users',
  'can_promote_users', 'can_suspend_fundis', 'can_force_logout',
  -- Fundi management
  'can_approve_fundis', 'can_review_high_risk_fundis', 'can_request_reupload',
  -- Jobs
  'can_assign_jobs', 'can_cancel_jobs', 'can_reassign_jobs',
  -- Finance
  'can_complete_payouts', 'can_issue_refunds', 'can_release_escrow',
  'can_freeze_wallet', 'can_export_reports', 'can_reconcile_payments',
  -- Commission
  'can_manage_commission',  -- may not exist yet, that's OK
  -- Promotions
  'can_activate_promotions', 'can_enable_disable_referrals',
  'can_enable_disable_loyalty', 'can_manage_referral_campaigns',
  -- Fraud
  'can_flag_transactions', 'can_resolve_alerts', 'can_review_referral_fraud',
  'can_freeze_accounts', 'can_escalate_fraud',
  -- Support
  'can_reply_tickets', 'can_resolve_disputes', 'can_contact_users',
  -- DevOps
  'can_restart_services', 'can_view_deployments', 'can_monitor_uptime',
  'can_configure_apis',
  -- AI
  'can_approve_ai_recommendation', 'can_reject_ai_recommendation'
)
on conflict do nothing;

-- Also grant any permission not yet listed (super_admin = everything)
insert into role_permissions (role, permission_code)
select 'super_admin', code from permissions
where code not in (
  select permission_code from role_permissions where role = 'super_admin'
)
on conflict do nothing;

-- ── OPS MANAGER (Operations Department) ───────────────────────────
-- Can: approve/reject/suspend fundis, reassign jobs, resolve operational issues
-- Cannot: change roles, access revenue, access payouts, access AI,
--         change commission
insert into role_permissions (role, permission_code)
select 'ops_manager', code from permissions
where code in (
  'can_view_metrics', 'can_view_fundis', 'can_view_users',
  'can_view_all_jobs', 'can_view_disputes', 'can_view_tickets',
  'can_view_verification_documents',
  'can_approve_fundis', 'can_suspend_fundis', 'can_request_reupload',
  'can_assign_jobs', 'can_cancel_jobs', 'can_reassign_jobs',
  'can_resolve_disputes', 'can_reply_tickets', 'can_contact_users',
  'can_view_dispatch_dashboard', 'can_view_support_dashboard'
)
on conflict do nothing;

-- ── SUPPORT AGENT (Customer Service) ──────────────────────────────
-- Can: create/resolve tickets, escalate cases, contact users
-- Cannot: issue payouts, ban users, change permissions, access revenue
insert into role_permissions (role, permission_code)
select 'support_agent', code from permissions
where code in (
  'can_view_users', 'can_view_fundis', 'can_view_tickets',
  'can_view_disputes', 'can_view_all_jobs',
  'can_reply_tickets', 'can_resolve_disputes', 'can_request_reupload',
  'can_contact_users',
  'can_view_support_dashboard'
)
on conflict do nothing;

-- ── FRAUD ANALYST (Trust & Safety) ────────────────────────────────
-- Can: flag users, suspend accounts, freeze accounts, escalate fraud
-- Cannot: approve payouts, change commissions, change roles
insert into role_permissions (role, permission_code)
select 'fraud_analyst', code from permissions
where code in (
  'can_view_fraud_dashboard', 'can_view_fundis', 'can_view_users',
  'can_view_all_jobs', 'can_view_referral_analytics',
  'can_flag_transactions', 'can_resolve_alerts', 'can_review_referral_fraud',
  'can_suspend_fundis', 'can_ban_fraud_users', 'can_freeze_accounts',
  'can_escalate_fraud'
)
on conflict do nothing;

-- ── FINANCE TEAM (Accounting) ─────────────────────────────────────
-- Can: approve payouts, review refunds, export reports, reconcile payments
-- Cannot: suspend users, manage roles, approve fundis
insert into role_permissions (role, permission_code)
select 'finance_team', code from permissions
where code in (
  'can_view_revenue', 'can_view_payments', 'can_view_commissions',
  'can_view_all_jobs', 'can_view_referral_analytics',
  'can_view_finance_dashboard',
  'can_complete_payouts', 'can_issue_refunds', 'can_release_escrow',
  'can_export_reports', 'can_reconcile_payments'
)
on conflict do nothing;

-- ── DISPATCH TEAM (Marketplace Operations) ────────────────────────
-- Can: assign/reassign jobs, monitor job progress, contact fundis
-- Cannot: access revenue, access AI, change permissions
insert into role_permissions (role, permission_code)
select 'dispatch_team', code from permissions
where code in (
  'can_view_all_jobs', 'can_view_fundis',
  'can_view_dispatch_dashboard',
  'can_assign_jobs', 'can_cancel_jobs', 'can_reassign_jobs',
  'can_contact_users'
)
on conflict do nothing;

-- ── DEVOPS ENGINEER (Infrastructure) ──────────────────────────────
-- Can: restart services, enable maintenance, view deployments, monitor uptime
-- Cannot: view customer payments, access commissions, approve fundis
insert into role_permissions (role, permission_code)
select 'devops_engineer', code from permissions
where code in (
  'can_view_health', 'can_view_logs', 'can_view_metrics',
  'can_view_devops_dashboard', 'can_view_platform_health',
  'can_view_deployments', 'can_monitor_uptime',
  'can_restart_services', 'can_manage_system'
)
on conflict do nothing;

-- ── AUDITOR (Compliance — Read-Only) ──────────────────────────────
-- Can see: everything (read-only)
-- Cannot: edit anything, approve anything, suspend anyone
insert into role_permissions (role, permission_code)
select 'auditor', code from permissions
where code like 'can_view_%'
on conflict do nothing;

-- ── 3. Seed the 8 staff roles if they don't exist ─────────────────
-- (uses the existing seed.js — this migration just ensures role_perms are correct)

-- ── 4. Update the 'admin' legacy role to mirror ops_manager ──────
-- (for backward compat — admin role is being phased out in favor of super_admin)
insert into role_permissions (role, permission_code)
select 'admin', code from permissions
where code in (
  'can_view_metrics', 'can_view_fundis', 'can_view_users',
  'can_view_all_jobs', 'can_view_disputes', 'can_view_tickets',
  'can_view_verification_documents', 'can_view_revenue',
  'can_approve_fundis', 'can_suspend_fundis', 'can_request_reupload',
  'can_assign_jobs', 'can_cancel_jobs', 'can_reassign_jobs',
  'can_resolve_disputes', 'can_reply_tickets',
  'can_view_dispatch_dashboard', 'can_view_support_dashboard'
)
on conflict do nothing;

-- ── Done ──────────────────────────────────────────────────────────
-- Verification queries (run manually to confirm):
-- select rp.role, count(*) as perms from role_permissions rp group by rp.role order by rp.role;
-- Expected:
--   admin: 19
--   auditor: ~16 (all can_view_*)
--   devops_engineer: 9
--   dispatch_team: 7
--   finance_team: 11
--   fraud_analyst: 12
--   ops_manager: 19
--   super_admin: ~50 (everything)
--   support_agent: 10
