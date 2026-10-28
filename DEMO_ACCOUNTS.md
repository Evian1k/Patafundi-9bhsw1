# PataFundi — Demo Accounts (DEVELOPMENT ONLY)

> ⚠️ **These credentials are for local development and demo environments ONLY.**
> They are seeded only by explicit development/test actions. Production
> startup never seeds demo accounts. Use a unique local-only
> `PATAFUNDI_DEMO_SEED_PASSWORD`; never reuse it for real accounts.

## Platform owner (all environments)

Spec §3 names the authorized owner account. In development/test it is
provisioned only when an explicit `OWNER_PASSWORD` is set; in production it is created **only** by
`backend/scripts/bootstrap-owner.js` with a password you supply via the
`OWNER_PASSWORD` environment variable (never committed, never printed to logs).
The password is never stored in source control.

| Account | Email | Password | Role |
|---|---|---|---|
| Emmanuel Evian | `emmanuelevian@gmail.com` | set via protected `OWNER_PASSWORD` at bootstrap | super_admin |

For isolated development only, set a unique `PATAFUNDI_DEMO_SEED_PASSWORD`
outside source control before running the seed command. The same configured
password is applied to created demo users; do not use an existing user's
password.

## Takeover demo ecosystem (`@patafundi.test`)

| Account | Email | Role / surface | What to test |
|---|---|---|---|
| Demo Customer | `customer.demo@patafundi.test` | Customer app | Search, book **Apex Home Services Ltd**, track, pay (dev provider), confirm OTP, review, multi-property |
| Demo Fundi (John Kamau) | `fundi.demo@patafundi.test` | Fundi app | Individual fundi with wallet, accepted/complete flows |
| Apex Company Owner | `company.demo@patafundi.test` | `/company` portal | Dashboard, jobs, dispatch, team, services, schedule, quality, finance, settings |
| Apex Dispatcher | `dispatcher.demo@patafundi.test` | `/company` portal | Accept + assign jobs. **Blocked from finance** (verify) |
| Apex Technician | `technician.demo@patafundi.test` | `/technician` app | Assigned jobs only: on the way → arrived → start work |
| Apex Technician 2 | `tech2.demo@patafundi.test` | `/technician` app | Electrical/HVAC assignments |
| Apex Technician 3 | `tech3.demo@patafundi.test` | `/technician` app | Appliance/HVAC assignments |
| Staff Operations | `operations.demo@patafundi.test` | `/staff` | Ops dashboard, fundis, jobs, users |
| Staff Support | `support.demo@patafundi.test` | `/staff` | Disputes & support queue |
| Staff Finance | `finance.demo@patafundi.test` | `/staff` | Payments, escrow, payouts, revenue |
| Staff Fraud | `fraud.demo@patafundi.test` | `/staff` | Fraud alerts & risk signals |
| Staff DevOps | `devops.demo@patafundi.test` | `/staff` | System health & integrations |
| Staff Auditor | `auditor.demo@patafundi.test` | `/staff` | Read-only audit logs |
| Super Admin | `admin.demo@patafundi.test` | `/admin` | Command center incl. **Companies**, Payouts, Refunds, Subscriptions, Reviews |

## Quick-login pages

- `/demo` — customer-facing quick login (uses the `@patafundi.com` set below)
- `/staff/login` — staff console entry
- `/admin/login` — owner/admin entry (never linked from public pages; access is
  enforced server-side by role, not by hiding the button)

## PataFundi-branded core accounts (`@patafundi.com`)

Seeded only by explicit local/test setup; production startup does not create
these accounts:

`demo@patafundi.com` (customer) · `fundi@patafundi.com` ·
`company@patafundi.com` · `admin@patafundi.com` (development-only role) ·
plus the documented operations/support/fraud/finance/dispatch/devops/auditor
roles. The configured seed password is shared across seeded demos.

## Legacy demo accounts (`@patafundi.com` / `@patafundi.test`)

Legacy demo accounts are retained for isolated test compatibility. Their
passwords are generated/configured outside source and they are not real
marketplace users.

## Demo company — "Apex Home Services Ltd"

Seeded with realistic development-only data (clearly labelled `DEMO`):

- **Status:** approved verified partner · rating 4.8+ · 1,284 completed jobs baseline
- **Services:** plumbing, electrical, HVAC, appliance repair (6 published services)
- **Service areas:** Nairobi, Kiambu, Westlands, Karen
- **Branches:** HQ — Westlands · Karen Branch
- **Team:** owner + dispatcher + 3 technicians (skills, availability **and map coordinates** set)
- **Guarantees:** 6-month workmanship warranty · 24h emergency response
- **Jobs:** seeded across the whole lifecycle (incoming → dispatch → active →
  awaiting confirmation → completed+paid+settled → cancelled)
- **Settlements:** completed jobs have server-computed settlements
  (gross − 15% platform commission = net)

## Quick start

```bash
npm run db:push        # migrations + takeover seed (idempotent)
npm run dev            # backend :4000 + frontend :3000
```
