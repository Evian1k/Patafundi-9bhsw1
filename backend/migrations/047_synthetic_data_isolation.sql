ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE company_partner_applications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE company_services ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE escrow_transactions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE revenue_ledger ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE company_settlements ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE fundi_wallets ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE users
SET is_demo = true
WHERE email LIKE '%.demo@patafundi.test'
   OR (lower(email), phone, role, full_name) IN (
     ('demo@patafundi.com', '254712100001', 'customer', 'Demo Customer'),
     ('demo@patafundi.com', '254712000001', 'customer', 'Demo Customer'),
     ('company@patafundi.com', '254712100002', 'company_admin', 'Demo Company Admin'),
     ('company@patafundi.com', '254712000002', 'company_admin', 'Demo Company Admin'),
     ('fundi@patafundi.com', '254712100003', 'fundi', 'Demo Fundi'),
     ('fundi@patafundi.com', '254712000003', 'fundi', 'Demo Fundi'),
     ('admin@patafundi.com', '254712100004', 'super_admin', 'Super Admin'),
     ('admin@patafundi.com', '254712000004', 'super_admin', 'Super Admin'),
     ('admin@patafundi.com', '254712000004', 'admin', 'Demo Admin'),
     ('ops@patafundi.com', '254712100005', 'admin', 'Ops Manager'),
     ('ops@patafundi.com', '254712000005', 'admin', 'Ops Manager'),
     ('support@patafundi.com', '254712100006', 'support_agent', 'Support Agent'),
     ('support@patafundi.com', '254712000006', 'support_agent', 'Support Agent'),
     ('fraud@patafundi.com', '254712100007', 'fraud_analyst', 'Fraud Analyst'),
     ('fraud@patafundi.com', '254712000007', 'fraud_analyst', 'Fraud Analyst'),
     ('finance@patafundi.com', '254712100008', 'finance_team', 'Finance Team'),
     ('finance@patafundi.com', '254712000008', 'finance_team', 'Finance Team'),
     ('dispatch@patafundi.com', '254712100009', 'dispatch_team', 'Dispatch Team'),
     ('dispatch@patafundi.com', '254712000009', 'dispatch_team', 'Dispatch Team'),
     ('devops@patafundi.com', '254712100010', 'devops_engineer', 'DevOps Engineer'),
     ('devops@patafundi.com', '254712000010', 'devops_engineer', 'DevOps Engineer'),
     ('auditor@patafundi.com', '254712100011', 'auditor', 'Auditor'),
     ('auditor@patafundi.com', '254712000011', 'auditor', 'Auditor')
   );

UPDATE fundis f SET is_demo = true
FROM users u WHERE u.id = f.user_id AND u.is_demo;
UPDATE company_partner_applications a SET is_demo = true
FROM users u WHERE u.id = a.user_id AND u.is_demo;
UPDATE company_profiles c SET is_demo = true
FROM users u WHERE u.id = c.owner_user_id AND u.is_demo;
UPDATE company_profiles c SET is_demo = true
FROM company_partner_applications a WHERE a.id = c.application_id AND a.is_demo;
UPDATE company_members m SET is_demo = true
FROM users u WHERE u.id = m.user_id AND u.is_demo;
UPDATE company_members m SET is_demo = true
FROM company_profiles c WHERE c.id = m.company_id AND c.is_demo;
UPDATE company_services s SET is_demo = true
FROM company_profiles c WHERE c.id = s.company_id AND c.is_demo;
UPDATE jobs j SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id IN (j.customer_id, j.fundi_id, j.technician_user_id, j.assigned_by) AND u.is_demo)
   OR EXISTS (SELECT 1 FROM company_profiles c WHERE c.id = j.company_id AND c.is_demo);
UPDATE payments p SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = p.customer_id AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = p.job_id AND j.is_demo);
UPDATE escrow_transactions e SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = e.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM payments p WHERE p.id = e.payment_id AND p.is_demo);
UPDATE payouts p SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = p.fundi_id AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = p.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM company_profiles c WHERE c.id = p.company_id AND c.is_demo);
UPDATE reviews r SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = r.reviewer_id AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = r.job_id AND j.is_demo);
UPDATE subscriptions s SET is_demo = true
FROM users u WHERE u.id = s.fundi_id AND u.is_demo;
UPDATE revenue_ledger r SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id IN (r.user_id, r.fundi_id) AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = r.job_id AND j.is_demo);
UPDATE company_settlements s SET is_demo = true
WHERE EXISTS (SELECT 1 FROM company_profiles c WHERE c.id = s.company_id AND c.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = s.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM payments p WHERE p.id = s.payment_id AND p.is_demo);
UPDATE wallets w SET is_demo = true
FROM users u WHERE u.id = w.user_id AND u.is_demo;
UPDATE fundi_wallets w SET is_demo = true
FROM users u WHERE u.id = w.fundi_id AND u.is_demo;
UPDATE wallet_transactions w SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = w.fundi_id AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = w.job_id AND j.is_demo);
UPDATE notifications n SET is_demo = true
FROM users u WHERE u.id = n.user_id AND u.is_demo;

CREATE OR REPLACE FUNCTION propagate_demo_marker() RETURNS trigger AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  source_demo boolean := false;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'fundis' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'user_id')::uuid;
    WHEN 'company_partner_applications' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'user_id')::uuid;
    WHEN 'company_profiles' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'owner_user_id')::uuid;
      IF NOT source_demo AND row_data->>'application_id' IS NOT NULL THEN
        SELECT is_demo INTO source_demo FROM company_partner_applications WHERE id = (row_data->>'application_id')::uuid;
      END IF;
    WHEN 'company_members' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'user_id')::uuid;
      IF NOT source_demo THEN
        SELECT is_demo INTO source_demo FROM company_profiles WHERE id = (row_data->>'company_id')::uuid;
      END IF;
    WHEN 'company_services' THEN
      SELECT is_demo INTO source_demo FROM company_profiles WHERE id = (row_data->>'company_id')::uuid;
    WHEN 'jobs' THEN
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id IN (
          nullif(row_data->>'customer_id', '')::uuid,
          nullif(row_data->>'fundi_id', '')::uuid,
          nullif(row_data->>'technician_user_id', '')::uuid,
          nullif(row_data->>'assigned_by', '')::uuid
        ) AND is_demo
      ) OR EXISTS (
        SELECT 1 FROM company_profiles WHERE id = nullif(row_data->>'company_id', '')::uuid AND is_demo
      ) INTO source_demo;
    WHEN 'payments' THEN
      SELECT EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'customer_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'escrow_transactions' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM payments WHERE id = (row_data->>'payment_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'payouts' THEN
      SELECT EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'fundi_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM company_profiles WHERE id = nullif(row_data->>'company_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'reviews' THEN
      SELECT EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'reviewer_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'subscriptions' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'fundi_id')::uuid;
    WHEN 'revenue_ledger' THEN
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id IN (
          nullif(row_data->>'user_id', '')::uuid,
          nullif(row_data->>'fundi_id', '')::uuid
        ) AND is_demo
      ) OR EXISTS (
        SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo
      ) INTO source_demo;
    WHEN 'company_settlements' THEN
      SELECT EXISTS (SELECT 1 FROM company_profiles WHERE id = (row_data->>'company_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM payments WHERE id = nullif(row_data->>'payment_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'wallets' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'user_id')::uuid;
    WHEN 'fundi_wallets' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'fundi_id')::uuid;
    WHEN 'wallet_transactions' THEN
      SELECT EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'fundi_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'notifications' THEN
      SELECT is_demo INTO source_demo FROM users WHERE id = (row_data->>'user_id')::uuid;
  END CASE;

  NEW.is_demo := coalesce(NEW.is_demo, false) OR coalesce(source_demo, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mark_fundis_demo ON fundis;
CREATE TRIGGER mark_fundis_demo BEFORE INSERT OR UPDATE ON fundis FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_company_applications_demo ON company_partner_applications;
CREATE TRIGGER mark_company_applications_demo BEFORE INSERT OR UPDATE ON company_partner_applications FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_company_profiles_demo ON company_profiles;
CREATE TRIGGER mark_company_profiles_demo BEFORE INSERT OR UPDATE ON company_profiles FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_company_members_demo ON company_members;
CREATE TRIGGER mark_company_members_demo BEFORE INSERT OR UPDATE ON company_members FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_company_services_demo ON company_services;
CREATE TRIGGER mark_company_services_demo BEFORE INSERT OR UPDATE ON company_services FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_jobs_demo ON jobs;
CREATE TRIGGER mark_jobs_demo BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_payments_demo ON payments;
CREATE TRIGGER mark_payments_demo BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_escrow_transactions_demo ON escrow_transactions;
CREATE TRIGGER mark_escrow_transactions_demo BEFORE INSERT OR UPDATE ON escrow_transactions FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_payouts_demo ON payouts;
CREATE TRIGGER mark_payouts_demo BEFORE INSERT OR UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_reviews_demo ON reviews;
CREATE TRIGGER mark_reviews_demo BEFORE INSERT OR UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_subscriptions_demo ON subscriptions;
CREATE TRIGGER mark_subscriptions_demo BEFORE INSERT OR UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_revenue_ledger_demo ON revenue_ledger;
CREATE TRIGGER mark_revenue_ledger_demo BEFORE INSERT OR UPDATE ON revenue_ledger FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_company_settlements_demo ON company_settlements;
CREATE TRIGGER mark_company_settlements_demo BEFORE INSERT OR UPDATE ON company_settlements FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_wallets_demo ON wallets;
CREATE TRIGGER mark_wallets_demo BEFORE INSERT OR UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_fundi_wallets_demo ON fundi_wallets;
CREATE TRIGGER mark_fundi_wallets_demo BEFORE INSERT OR UPDATE ON fundi_wallets FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_wallet_transactions_demo ON wallet_transactions;
CREATE TRIGGER mark_wallet_transactions_demo BEFORE INSERT OR UPDATE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();
DROP TRIGGER IF EXISTS mark_notifications_demo ON notifications;
CREATE TRIGGER mark_notifications_demo BEFORE INSERT OR UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION propagate_demo_marker();

CREATE INDEX IF NOT EXISTS idx_users_is_demo ON users(is_demo);
CREATE INDEX IF NOT EXISTS idx_fundis_marketplace_demo ON fundis(is_demo, approval_status, online);
CREATE INDEX IF NOT EXISTS idx_companies_marketplace_demo ON company_profiles(is_demo, status);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_is_demo ON revenue_ledger(is_demo, created_at DESC);
