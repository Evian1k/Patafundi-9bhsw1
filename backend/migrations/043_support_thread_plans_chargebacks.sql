-- 043: Master-spec completeness pass (support threads, DB-driven plans, chargebacks).
--   1) support_tickets gains user_id (authenticated filers) + priority (spec §71
--      priority levels) so tickets are no longer anonymous-only single messages.
--   2) support_ticket_messages: real threaded conversation between the filer and
--      staff on a ticket, with optional attachment URL (spec §71 messages).
--   3) subscription_plans: plans move from a hardcoded price map into the
--      database so admins can reprice/rename plans without deploys (spec §22-24).
--   4) payment_chargebacks: chargebacks become first-class records tied to real
--      payments with an investigation lifecycle (spec §26-28).

-- ── 1) support_tickets: owner + priority ─────────────────────────────────────
alter table support_tickets add column if not exists user_id uuid references users(id);
alter table support_tickets add column if not exists priority text not null default 'normal'
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent'));
create index if not exists idx_support_tickets_user on support_tickets(user_id);
create index if not exists idx_support_tickets_status_priority on support_tickets(status, priority);

-- ── 2) ticket message thread ─────────────────────────────────────────────────
create table if not exists support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_id uuid references users(id),
  author_role text not null default 'customer' check (author_role in ('customer', 'staff')),
  body text not null,
  attachment_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ticket_messages_ticket on support_ticket_messages(ticket_id, created_at);

-- Seed one message per existing ticket so the original request is never lost
-- when the UI switches from a single message field to a thread.
insert into support_ticket_messages (ticket_id, author_role, body)
select id, 'customer', message from support_tickets
where not exists (select 1 from support_ticket_messages m where m.ticket_id = support_tickets.id);

-- ── 3) subscription plans (DB-driven pricing, spec §22-24) ───────────────────
create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  audience text not null check (audience in ('fundi', 'company')),
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'KES',
  duration_days integer not null check (duration_days > 0),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into subscription_plans (code, name, audience, price, currency, duration_days, features) values
  ('fundi_pro_monthly', 'Fundi Pro Monthly', 'fundi', 500, 'KES', 30,
   '["Priority ranking in search results", "Pro badge on your profile", "Eligible for premium job offers", "Lower payout processing wait"]'),
  ('fundi_pro_yearly', 'Fundi Pro Yearly', 'fundi', 5000, 'KES', 365,
   '["All Pro monthly benefits", "Two months free vs monthly", "Priority ranking in search results", "Pro badge on your profile"]'),
  ('company_growth_monthly', 'Company Growth Monthly', 'company', 500, 'KES', 30,
   '["Verified company listing priority", "Team of up to 25 staff", "Company analytics dashboard", "Booking inbox for your services"]'),
  ('company_growth_yearly', 'Company Growth Yearly', 'company', 5000, 'KES', 365,
   '["All Growth monthly benefits", "Two months free vs monthly", "Verified company listing priority", "Company analytics dashboard"]')
on conflict (code) do nothing;

-- ── 4) payment chargebacks (spec §26-28) ─────────────────────────────────────
create table if not exists payment_chargebacks (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id),
  provider text not null default 'mpesa' check (provider in ('mpesa', 'stripe', 'manual')),
  provider_reference text,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'KES',
  reason text not null,
  status text not null default 'open' check (status in ('open', 'under_review', 'won', 'lost', 'reversed')),
  evidence jsonb not null default '[]'::jsonb,
  decided_by uuid references users(id),
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chargebacks_payment on payment_chargebacks(payment_id);
create index if not exists idx_chargebacks_status on payment_chargebacks(status);

-- ── 5) payments.metadata (Stripe intent ids live beside M-Pesa checkout ids) ─
alter table payments add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists idx_payments_stripe_intent on payments((metadata->>'stripe_intent_id')) where metadata ? 'stripe_intent_id';
