-- Migration 046: guarantee the full users.role list.
--
-- Context: on freshly built databases migration 022 has been observed to be
-- recorded as applied while its constraint change did not stick (the live
-- CHECK kept migration 009's narrower list without company_admin /
-- ops_manager), which made any INSERT of a company_admin user fail with
-- "violates check constraint users_role_check" during seeding/bootstrap.
--
-- This migration is idempotent: it always drops and re-adds the constraint
-- with the authoritative, complete role list. Running it on a database that
-- already has the right definition is a harmless no-op rebuild.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('customer', 'fundi', 'fundi_pending', 'admin', 'super_admin',
           'company_admin', 'ops_manager', 'support_agent', 'fraud_analyst',
           'finance_team', 'dispatch_team', 'devops_engineer', 'auditor')
);
