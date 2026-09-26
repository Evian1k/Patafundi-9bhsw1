# FundiHub — Demo Accounts (DEVELOPMENT ONLY)

> ⚠️ **These credentials are for local development and demo environments ONLY.**
> They are seeded by `backend/scripts/seed-takeover.js` and `ensure-dev-db.js`,
> which **refuse to run against production** (`NODE_ENV=production` aborts).
> Never reuse them for real accounts. The `.test` / `fundihub.com` demo domains
> are reserved for this purpose.

## Platform owner (all environments)

Spec §3 names the authorized owner account. In dev it is seeded like the demo
accounts; in production it is created **only** by
`backend/scripts/bootstrap-owner.js` (password from `OWNER_PASSWORD`).

| Account | Email | Password (dev only) | Role |
|---|---|---|---|
| Emmanuel Evian | `emmanuelevian@gmail.com` | `FundiHubOwner@2026` | super_admin |

## Unified demo password

```
FundiHub#2026
```

## Takeover demo ecosystem (`@fundihub.test`)

| Account | Email | Role / surface | What to test |
|---|---|---|---|
| Demo Customer | `customer.demo@fundihub.test` | Customer app | Search, book **Apex Home Services Ltd**, track, pay (dev provider), confirm OTP, review, multi-property |
| Demo Fundi (John Kamau) | `fundi.demo@fundihub.test` | Fundi app | Individual fundi with wallet, accepted/complete flows |
| Apex Company Owner | `company.demo@fundihub.test` | `/company` portal | Dashboard, jobs, dispatch, team, services, schedule, quality, finance, settings |
| Apex Dispatcher | `dispatcher.demo@fundihub.test` | `/company` portal | Accept + assign jobs. **Blocked from finance** (verify) |
| Apex Technician | `technician.demo@fundihub.test` | `/technician` app | Assigned jobs only: on the way → arrived → start work |
| Apex Technician 2 | `tech2.demo@fundihub.test` | `/technician` app | Electrical/HVAC assignments |
| Apex Technician 3 | `tech3.demo@fundihub.test` | `/technician` app | Appliance/HVAC assignments |
| Staff Operations | `operations.demo@fundihub.test` | `/staff` | Ops dashboard, fundis, jobs, users |
| Staff Support | `support.demo@fundihub.test` | `/staff` | Disputes & support queue |
| Staff Finance | `finance.demo@fundihub.test` | `/staff` | Payments, escrow, payouts, revenue |
| Staff Fraud | `fraud.demo@fundihub.test` | `/staff` | Fraud alerts & risk signals |
| Staff DevOps | `devops.demo@fundihub.test` | `/staff` | System health & integrations |
| Staff Auditor | `auditor.demo@fundihub.test` | `/staff` | Read-only audit logs |
| Super Admin | `admin.demo@fundihub.test` | `/admin` | Command center incl. **Companies**, Payouts, Refunds, Subscriptions, Reviews |

## Quick-login pages

- `/demo` — customer-facing quick login (uses the `@fundihub.com` set below)
- `/staff/login` — staff console entry
- `/admin/login` — owner/admin entry (never linked from public pages; access is
  enforced server-side by role, not by hiding the button)

## FundiHub-branded core accounts (`@fundihub.com`)

Seeded by `ensure-dev-db.js` at boot, shown on `/demo`:

`demo@fundihub.com` / `Demo@2024!` (customer) · `fundi@fundihub.com` / `Fundi@2024!` ·
`company@fundihub.com` / `Company@2024!` · `admin@fundihub.com` / `Admin@2024!` (super_admin) ·
plus `ops@ / support@ / fraud@ / finance@ / dispatch@ / devops@ / auditor@`
(each with its own documented password in `backend/scripts/ensure-dev-db.js`).

## Legacy demo accounts (`@patafundi.com` / `@patafundi.test`)

Still seeded and working for backward compatibility — same passwords as their
FundiHub-branded twins (`PataFundi#2026` was the legacy unified password).
They are no longer listed on `/demo`.

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
