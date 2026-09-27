-- 042: Workflow-state completeness (production build pass).
--   1) refund_requests gains 'under_review' (spec §38: REQUESTED → UNDER_REVIEW
--      → APPROVED/REJECTED → PROCESSING → REFUNDED). The existing CHECK did not
--      include it, so the state was unusable.
--   2) support_tickets gains 'waiting_customer' (spec §71 ticket statuses).
-- Both statements are idempotent: rebuilding the CHECK constraints with the
-- full value lists is safe to re-run.

alter table refund_requests drop constraint if exists refund_requests_status_check;
alter table refund_requests add constraint refund_requests_status_check
  check (status in ('requested', 'under_review', 'approved', 'rejected', 'processing', 'completed', 'cancelled'));

alter table support_tickets drop constraint if exists support_tickets_status_check;
alter table support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed'));
