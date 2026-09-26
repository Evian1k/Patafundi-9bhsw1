-- 035: Fix fundi subscription payment lifecycle (spec §payments: server-controlled money)
-- Problems fixed:
--   1. subscriptions.status CHECK only allowed active/cancelled/expired, but the
--      activation route inserts 'pending' first (constraint violation on insert).
--   2. No metadata column — the M-Pesa checkout_request_id used for webhook
--      matching had nowhere to live, so payment completion could never flip a
--      subscription to active.
alter table subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'expired', 'failed', 'cancelled'));

-- Webhook matches subscriptions by checkout_request_id (partial index keeps it tiny)
create index if not exists subscriptions_checkout_request_idx
  on subscriptions ((metadata->>'checkout_request_id'))
  where metadata ? 'checkout_request_id';
