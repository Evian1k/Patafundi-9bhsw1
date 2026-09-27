-- 044: Company Support role (spec §15: Owner/Manager/Dispatcher/Technician/
-- Finance/Support under RBAC). Support staff see the portal for customer
-- communication and job visibility but receive no financial or dispatch power.

alter table company_members drop constraint if exists company_members_role_check;
alter table company_members add constraint company_members_role_check
  check (role in ('owner', 'manager', 'admin', 'dispatcher', 'finance', 'support', 'technician'));
