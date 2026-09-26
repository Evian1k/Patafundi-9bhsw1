# PataFundi — Demo Accounts (DEVELOPMENT ONLY)

> ⚠️ **These credentials are for local development and demo environments ONLY.**
> They are seeded by `backend/scripts/seed-takeover.js` which **refuses to run
> against production** (`NODE_ENV=production` aborts). Never reuse them for real
> accounts. The `.test` domain is reserved for this purpose.

## Unified demo password

```
PataFundi#2026
```

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
| Super Admin | `admin.demo@patafundi.test` | `/admin` | Command center incl. **Companies** (applications review, suspend/reactivate) |

## Demo company — "Apex Home Services Ltd"

Seeded with realistic development-only data (clearly labelled `DEMO`):

- **Status:** approved verified partner · rating 4.8+ · 1,284 completed jobs baseline
- **Services:** plumbing, electrical, HVAC, appliance repair (6 published services)
- **Service areas:** Nairobi, Kiambu, Westlands, Karen
- **Branches:** HQ — Westlands · Karen Branch
- **Team:** owner + dispatcher + 3 technicians (skills & availability set)
- **Guarantees:** 6-month workmanship warranty · 24h emergency response
- **Jobs:** seeded across the whole lifecycle (incoming → dispatch → active →
  awaiting confirmation → completed+paid+settled → cancelled)
- **Settlements:** completed jobs have server-computed settlements
  (gross − 15% platform commission = net)

## Legacy demo accounts (`@patafundi.com` — original seed)

Also available (seeded by `ensure-dev-db.js`), one per staff role:
`demo@patafundi.com` / `Demo@2024!`, `company@patafundi.com` / `Company@2024!`,
`fundi@patafundi.com` / `Fundi@2024!`, `admin@patafundi.com` / `Admin@2024!`,
plus `ops@ / support@ / fraud@ / finance@ / dispatch@ / devops@ / auditor@`
(each with its own documented password in `backend/scripts/ensure-dev-db.js`).

## Quick start

```bash
npm run db:push        # migrations + takeover seed (idempotent)
npm run dev            # backend :4000 + frontend :3000
# open http://localhost:3000/demo for one-click demo login
```

## Full demo journey (acceptance test)

1. Login as **customer.demo** → open `/companies` → **Apex Home Services Ltd**
2. Book a service → job appears in **company.demo** dispatch board
3. **dispatcher.demo** accepts → assigns **Peter Tech**
4. **technician.demo** (`/technician`) → On the way → Arrived → Start work
5. Technician completes → customer gets OTP
6. Customer pays via the **development payment provider** (escrow held)
7. Customer confirms with OTP → escrow auto-releases →
   **settlement appears in company finance** (net of 15% commission)
8. Customer reviews → audit trail records every step
