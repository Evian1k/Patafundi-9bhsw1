ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE accounting_ledger ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE fundi_job_offers ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE job_timeline ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE job_status_updates ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE payment_chargebacks ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE dispute_files ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE fraud_alerts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE expected_commissions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE commission_debts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE violations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE escrow_accounts e SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = e.job_id AND j.is_demo);
UPDATE accounting_ledger a SET is_demo = true
WHERE (a.source_type = 'payment' AND EXISTS (
         SELECT 1 FROM payments p WHERE p.id = a.source_id AND p.is_demo
       ))
   OR (a.source_type IN ('payout', 'payout_deduction') AND EXISTS (
         SELECT 1 FROM payouts p WHERE p.id = a.source_id AND p.is_demo
       ))
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id::text = a.metadata->>'jobId' AND j.is_demo);
UPDATE refund_requests r SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = r.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM payments p WHERE p.id = r.payment_id AND p.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = r.customer_id AND u.is_demo);
UPDATE disputes d SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = d.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = d.opened_by AND u.is_demo);
UPDATE quotes q SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = q.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id IN (q.customer_id, q.fundi_id, q.created_by) AND u.is_demo);
UPDATE fundi_job_offers o SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = o.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = o.fundi_id AND u.is_demo);
UPDATE job_timeline t SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = t.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = t.actor_id AND u.is_demo);
UPDATE job_status_updates t SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = t.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = t.actor_id AND u.is_demo);
UPDATE messages m SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = m.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id AND u.is_demo);
UPDATE chat_messages m SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = m.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id AND u.is_demo);
UPDATE payment_chargebacks c SET is_demo = true
WHERE EXISTS (SELECT 1 FROM payments p WHERE p.id = c.payment_id AND p.is_demo);
UPDATE dispute_files f SET is_demo = true
WHERE EXISTS (SELECT 1 FROM disputes d WHERE d.id = f.dispute_id AND d.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = f.uploaded_by AND u.is_demo);
UPDATE fraud_alerts f SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = f.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id = f.user_id AND u.is_demo);
UPDATE expected_commissions e SET is_demo = true
WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = e.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM users u WHERE u.id IN (e.fundi_id, e.customer_id) AND u.is_demo);
UPDATE commission_debts d SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = d.user_id AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = d.job_id AND j.is_demo)
   OR EXISTS (SELECT 1 FROM payouts p WHERE p.id = d.deducted_from_payout_id AND p.is_demo);
UPDATE violations v SET is_demo = true
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id IN (v.user_id, v.created_by) AND u.is_demo)
   OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = v.job_id AND j.is_demo);
UPDATE notifications n SET is_demo = true
WHERE EXISTS (
  SELECT 1 FROM jobs j
  WHERE j.id::text = coalesce(n.data->>'jobId', n.data->>'job_id') AND j.is_demo
);

CREATE OR REPLACE FUNCTION propagate_additional_demo_marker() RETURNS trigger AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  source_demo boolean := false;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'escrow_accounts' THEN
      SELECT is_demo INTO source_demo FROM jobs WHERE id = (row_data->>'job_id')::uuid;
    WHEN 'accounting_ledger' THEN
      SELECT
        (row_data->>'source_type' = 'payment' AND EXISTS (
          SELECT 1 FROM payments WHERE id = nullif(row_data->>'source_id', '')::uuid AND is_demo
        ))
        OR (row_data->>'source_type' IN ('payout', 'payout_deduction') AND EXISTS (
          SELECT 1 FROM payouts WHERE id = nullif(row_data->>'source_id', '')::uuid AND is_demo
        ))
        OR EXISTS (
          SELECT 1 FROM jobs
          WHERE id::text = coalesce(row_data->'metadata'->>'jobId', row_data->'metadata'->>'job_id') AND is_demo
        ) INTO source_demo;
    WHEN 'refund_requests' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM payments WHERE id = nullif(row_data->>'payment_id', '')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'customer_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'disputes' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'opened_by')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'quotes' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (
            SELECT 1 FROM users
            WHERE id IN (
              nullif(row_data->>'customer_id', '')::uuid,
              nullif(row_data->>'fundi_id', '')::uuid,
              nullif(row_data->>'created_by', '')::uuid
            ) AND is_demo
          ) INTO source_demo;
    WHEN 'fundi_job_offers' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'fundi_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'job_timeline' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = nullif(row_data->>'actor_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'job_status_updates' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = nullif(row_data->>'actor_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'messages' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'sender_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'chat_messages' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'sender_id')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'payment_chargebacks' THEN
      SELECT is_demo INTO source_demo FROM payments WHERE id = (row_data->>'payment_id')::uuid;
    WHEN 'dispute_files' THEN
      SELECT EXISTS (SELECT 1 FROM disputes WHERE id = (row_data->>'dispute_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'uploaded_by')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'fraud_alerts' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM users WHERE id = nullif(row_data->>'user_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'expected_commissions' THEN
      SELECT EXISTS (SELECT 1 FROM jobs WHERE id = (row_data->>'job_id')::uuid AND is_demo)
          OR EXISTS (
            SELECT 1 FROM users
            WHERE id IN ((row_data->>'fundi_id')::uuid, (row_data->>'customer_id')::uuid) AND is_demo
          ) INTO source_demo;
    WHEN 'commission_debts' THEN
      SELECT EXISTS (SELECT 1 FROM users WHERE id = (row_data->>'user_id')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
          OR EXISTS (SELECT 1 FROM payouts WHERE id = nullif(row_data->>'deducted_from_payout_id', '')::uuid AND is_demo)
        INTO source_demo;
    WHEN 'violations' THEN
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id IN (
          nullif(row_data->>'user_id', '')::uuid,
          nullif(row_data->>'created_by', '')::uuid
        ) AND is_demo
      ) OR EXISTS (SELECT 1 FROM jobs WHERE id = nullif(row_data->>'job_id', '')::uuid AND is_demo)
        INTO source_demo;
  END CASE;

  NEW.is_demo := coalesce(NEW.is_demo, false) OR coalesce(source_demo, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'escrow_accounts', 'accounting_ledger', 'refund_requests', 'disputes', 'quotes',
    'fundi_job_offers', 'job_timeline', 'job_status_updates', 'messages', 'chat_messages',
    'payment_chargebacks', 'dispute_files', 'fraud_alerts', 'expected_commissions',
    'commission_debts', 'violations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS mark_%I_demo ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER mark_%I_demo BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION propagate_additional_demo_marker()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION propagate_user_demo_rows() RETURNS trigger AS $$
BEGIN
  IF NEW.is_demo AND NOT OLD.is_demo THEN
    UPDATE fundis SET is_demo = true WHERE user_id = NEW.id;
    UPDATE company_partner_applications SET is_demo = true WHERE user_id = NEW.id;
    UPDATE company_profiles SET is_demo = true WHERE owner_user_id = NEW.id;
    UPDATE company_members SET is_demo = true WHERE user_id = NEW.id;
    UPDATE jobs SET is_demo = true
      WHERE customer_id = NEW.id OR fundi_id = NEW.id OR technician_user_id = NEW.id OR assigned_by = NEW.id;
    UPDATE jobs j SET is_demo = true
      FROM company_profiles c WHERE j.company_id = c.id AND c.is_demo;
    UPDATE payments SET is_demo = true WHERE customer_id = NEW.id;
    UPDATE payments p SET is_demo = true
      FROM jobs j WHERE p.job_id = j.id AND j.is_demo;
    UPDATE escrow_accounts e SET is_demo = true
      FROM jobs j WHERE e.job_id = j.id AND j.is_demo;
    UPDATE escrow_transactions e SET is_demo = true
      FROM jobs j WHERE e.job_id = j.id AND j.is_demo;
    UPDATE payouts SET is_demo = true WHERE fundi_id = NEW.id;
    UPDATE payouts p SET is_demo = true
      WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = p.job_id AND j.is_demo)
         OR EXISTS (SELECT 1 FROM company_profiles c WHERE c.id = p.company_id AND c.is_demo);
    UPDATE reviews SET is_demo = true WHERE reviewer_id = NEW.id;
    UPDATE reviews r SET is_demo = true
      FROM jobs j WHERE r.job_id = j.id AND j.is_demo;
    UPDATE subscriptions SET is_demo = true WHERE fundi_id = NEW.id;
    UPDATE revenue_ledger SET is_demo = true WHERE user_id = NEW.id OR fundi_id = NEW.id;
    UPDATE revenue_ledger r SET is_demo = true
      WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = r.job_id AND j.is_demo)
         OR EXISTS (SELECT 1 FROM payouts p WHERE p.id = r.payout_id AND p.is_demo);
    UPDATE company_settlements s SET is_demo = true
      WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = s.job_id AND j.is_demo)
         OR EXISTS (SELECT 1 FROM payments p WHERE p.id = s.payment_id AND p.is_demo)
         OR EXISTS (SELECT 1 FROM company_profiles c WHERE c.id = s.company_id AND c.is_demo);
    UPDATE wallets SET is_demo = true WHERE user_id = NEW.id;
    UPDATE fundi_wallets SET is_demo = true WHERE fundi_id = NEW.id;
    UPDATE wallet_transactions SET is_demo = true WHERE fundi_id = NEW.id;
    UPDATE wallet_transactions w SET is_demo = true
      FROM jobs j WHERE w.job_id = j.id AND j.is_demo;
    UPDATE notifications SET is_demo = true WHERE user_id = NEW.id;
    UPDATE notifications n SET is_demo = true
      WHERE EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.is_demo AND j.id::text = coalesce(n.data->>'jobId', n.data->>'job_id')
      );
    UPDATE disputes SET is_demo = true WHERE opened_by = NEW.id;
    UPDATE disputes d SET is_demo = true
      FROM jobs j WHERE d.job_id = j.id AND j.is_demo;
    UPDATE quotes SET is_demo = true WHERE customer_id = NEW.id OR fundi_id = NEW.id OR created_by = NEW.id;
    UPDATE quotes q SET is_demo = true
      FROM jobs j WHERE q.job_id = j.id AND j.is_demo;
    UPDATE fundi_job_offers SET is_demo = true WHERE fundi_id = NEW.id;
    UPDATE fundi_job_offers o SET is_demo = true
      FROM jobs j WHERE o.job_id = j.id AND j.is_demo;
    UPDATE job_timeline SET is_demo = true WHERE actor_id = NEW.id;
    UPDATE job_timeline t SET is_demo = true
      FROM jobs j WHERE t.job_id = j.id AND j.is_demo;
    UPDATE job_status_updates SET is_demo = true WHERE actor_id = NEW.id;
    UPDATE job_status_updates t SET is_demo = true
      FROM jobs j WHERE t.job_id = j.id AND j.is_demo;
    UPDATE messages SET is_demo = true WHERE sender_id = NEW.id;
    UPDATE messages m SET is_demo = true
      FROM jobs j WHERE m.job_id = j.id AND j.is_demo;
    UPDATE chat_messages SET is_demo = true WHERE sender_id = NEW.id;
    UPDATE chat_messages m SET is_demo = true
      FROM jobs j WHERE m.job_id = j.id AND j.is_demo;
    UPDATE refund_requests SET is_demo = true WHERE customer_id = NEW.id;
    UPDATE refund_requests r SET is_demo = true
      FROM jobs j WHERE r.job_id = j.id AND j.is_demo;
    UPDATE fraud_alerts SET is_demo = true WHERE user_id = NEW.id;
    UPDATE fraud_alerts f SET is_demo = true
      FROM jobs j WHERE f.job_id = j.id AND j.is_demo;
    UPDATE expected_commissions SET is_demo = true WHERE fundi_id = NEW.id OR customer_id = NEW.id;
    UPDATE expected_commissions e SET is_demo = true
      FROM jobs j WHERE e.job_id = j.id AND j.is_demo;
    UPDATE commission_debts SET is_demo = true WHERE user_id = NEW.id;
    UPDATE commission_debts d SET is_demo = true
      WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.id = d.job_id AND j.is_demo)
         OR EXISTS (SELECT 1 FROM payouts p WHERE p.id = d.deducted_from_payout_id AND p.is_demo);
    UPDATE violations SET is_demo = true WHERE user_id = NEW.id OR created_by = NEW.id;
    UPDATE violations v SET is_demo = true
      FROM jobs j WHERE v.job_id = j.id AND j.is_demo;
    UPDATE dispute_files SET is_demo = true WHERE uploaded_by = NEW.id;
    UPDATE dispute_files f SET is_demo = true
      FROM disputes d WHERE f.dispute_id = d.id AND d.is_demo;
    UPDATE payment_chargebacks c SET is_demo = true
      FROM payments p WHERE c.payment_id = p.id AND p.customer_id = NEW.id;
    UPDATE payment_chargebacks c SET is_demo = true
      FROM payments p WHERE c.payment_id = p.id AND p.is_demo;
    UPDATE accounting_ledger a SET is_demo = true
      WHERE (a.source_type = 'payment' AND EXISTS (
               SELECT 1 FROM payments p WHERE p.id = a.source_id AND p.customer_id = NEW.id
             ))
         OR (a.source_type IN ('payout', 'payout_deduction') AND EXISTS (
               SELECT 1 FROM payouts p WHERE p.id = a.source_id AND p.fundi_id = NEW.id
             ));
    UPDATE notifications SET is_demo = true
      WHERE EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.is_demo AND j.id::text = coalesce(notifications.data->>'jobId', notifications.data->>'job_id')
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS propagate_demo_rows_after_user_update ON users;
CREATE TRIGGER propagate_demo_rows_after_user_update
AFTER UPDATE OF is_demo ON users
FOR EACH ROW EXECUTE FUNCTION propagate_user_demo_rows();

CREATE OR REPLACE FUNCTION propagate_job_notification_demo_marker() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.is_demo AND j.id::text = coalesce(NEW.data->>'jobId', NEW.data->>'job_id')
  ) THEN
    NEW.is_demo := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mark_job_notifications_demo ON notifications;
CREATE TRIGGER mark_job_notifications_demo
BEFORE INSERT OR UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION propagate_job_notification_demo_marker();

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_demo ON escrow_accounts(is_demo, status);
CREATE INDEX IF NOT EXISTS idx_accounting_ledger_demo ON accounting_ledger(is_demo, created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_demo ON quotes(is_demo, job_id);
CREATE INDEX IF NOT EXISTS idx_disputes_demo ON disputes(is_demo, status);
