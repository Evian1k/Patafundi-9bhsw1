-- Migration 022: Fix users role check constraint to include ops_manager
-- The original constraint (migration 001) didn't include 'ops_manager'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('customer', 'fundi', 'fundi_pending', 'admin', 'super_admin',
           'ops_manager', 'support_agent', 'fraud_analyst', 'finance_team',
           'dispatch_team', 'devops_engineer', 'auditor')
);
