# PataFundi — Complete System Spec (as built, post-takeover)

PataFundi is a **services-only marketplace** connecting customers with verified
individual Fundis and verified professional service companies. One platform
core — DB, Auth, RBAC, Jobs, Matching, Payments, Settlements, Notifications,
Realtime, Files, AI, Security, Audit — serving every role.

---

## 1. Architecture

| Layer | Technology |
|---|---|
| Frontend | Vite 7 + React 18 + react-router 6 + Tailwind (emerald design system) |
| Backend | Node.js + Express 5 (ESM), 365+ routes, socket.io realtime |
| Database | PostgreSQL (PGlite embedded in dev; portable to hosted PG via `DATABASE_URL`) |
| Migrations | 33 SQL migrations (001–033; 033 = takeover repairs) |
| Auth | JWT access (15 min) + refresh (30 d) httpOnly cookies, CSRF double-submit, OTP email verification, account lockout, 2FA (staff) |
| RBAC | role CHECK (13 roles) + permission tables (94 permissions) + `requirePermission` middleware |
| Tenant isolation | `requireCompanyMember` middleware on every company endpoint |
| Money | escrow (hold → release) + double-entry accounting ledger + revenue ledger + settlements + payouts — **server-authoritative** |
| Realtime | socket.io rooms `user:{id}`, `job:{id}`; events for job lifecycle, payments, chat, disputes |
| Files | local/S3-compatible storage service with signed URLs + access middleware (private documents protected) |
| AI | advisory assistant (customer job description / support / dispatch / fraud insights) — **no money or authorization powers** |

## 2. Roles (13 platform + 6 company-member)

`customer · fundi · fundi_pending · admin · super_admin · company_admin ·
ops_manager · support_agent · fraud_analyst · finance_team · dispatch_team ·
devops_engineer · auditor` — company-member roles: `owner · manager · admin ·
dispatcher · finance · technician`.

Authorization is **server-side** on every sensitive action (see
`PATAFUNDI_ROLE_SECURITY_AUDIT.md`).

## 3. Job lifecycle (state-machine enforced)

```
pending → matching → offered → accepted → assigned → scheduled →
on_the_way → arrived → in_progress → completion_requested → completed
+ cancelled · failed (terminal)
```

Invalid transitions rejected (400). Assignment writes `fundi_id`,
`technician_user_id`, `assigned_by`. Company jobs carry `provider_type='company'`
and `company_id`; individual jobs flow through the geo matching engine.

## 4. Money flow

```
CUSTOMER → payment provider (M-Pesa STK push | dev provider in sandbox)
→ webhook verification (amount match, replay check, signature)
→ payments.status=completed + escrow held (escrow_transactions, escrow_accounts)
→ work completed → customer OTP confirmation
→ settlementService.releaseJobEscrow (single transaction):
     escrow_transactions(release) · payments released · escrow_accounts drained
     → fundi wallet credit (individual) OR company_settlements row (company)
     → revenue_ledger commission entry → notifications → audit
→ payouts (individual: requested→processing→completed) | settlements (company: pending→paid)
→ refunds: payments refunded, escrow refunded, settlements voided, wallet debited
```

Commission: global 15% default, category overrides + promotional discounts,
withdrawal fees — all read from `platform_settings` server-side. Clients can
never set amounts (validated/clamped; quotes >25% off park as `offered` for
customer approval).

## 5. Matching & discovery

- Individual fundis: weighted engine (distance .30, rating .20, quality .15,
  acceptance .10, completion .10, response .05, verified .05, activity .05),
  bounding-box prefilter, skill match, overload filter, surge pricing (travel /
  emergency / night).
- Companies: public directory (category/area/search filters, real ratings),
  direct booking (job pinned to company) and an **open pool** claimed
  competitively by eligible companies (single-claim guard in the UPDATE).

## 6. Quotes & inspections

Complex jobs: company/fundi sends quote (`POST /company/jobs/:id/quote` or
fundi accept with revised price) → job parks as `offered` → customer approves
or rejects (`POST /jobs/:id/quote/decision`). Work cannot start before approval.

## 7. Multi-property & service records

- `customer_properties` (home/office/rental/shop/parents'/other) with default
  flag; jobs associate `property_id`.
- Completed jobs produce a service record: provider/company/technician,
  property, service, evidence photos, quote, final price, payment + escrow trail,
  warranty (guarantees JSONB), review, timeline (`job_timeline` + `audit_logs`).

## 8. Trust, verification & guarantees

- Fundi verification: ID/selfie upload, AI face-match framework, admin approval
  gates (`requireApprovedFundi`), tiers/badges.
- Companies: staff-reviewed application lifecycle, Verified Partner badge only
  for `approved` status; suspension blocks portal operations.
- Guarantees/warranties: company guarantees surfaced on the public profile;
  claims via the dispute workflow.

## 9. Notifications & messaging

- Per-user notifications (DB + socket.io): role-scoped queries; completion OTPs,
  payment events, assignments, application decisions, settlement creation.
- Chat between customer ↔ fundi/company/technician with room authorization
  (`canAccessJobRoom`), typing indicators, read receipts.

## 10. Design language

Dark/emerald identity: `--primary 160 84% 26%`, teal accents, rounded surfaces
(0.75rem+), soft shadows, restrained gradients, Inter + Plus Jakarta Sans.
Consoles (staff/admin/company) share the emerald system while keeping distinct
information architecture. Mobile: bottom navigation + card layouts; desktop:
sidebars + data tables. Verified at 360/390/430/768/1024/1280/1440 px targets.

## 11. Environments & integrations status

See `PATAFUNDI_ZAI_TAKEOVER_AUDIT.md §4` — PostgreSQL (portable, embedded in
dev), M-Pesa (adapter ready, CREDENTIAL REQUIRED), Stripe (NOT IMPLEMENTED),
email/SMS/push (NOT IMPLEMENTED — in-app works), storage (local + S3 adapter),
AI (implemented, advisory-only). The dev payment provider is clearly labelled
and never runs in production.
