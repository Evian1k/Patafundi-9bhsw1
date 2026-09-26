# PataFundi — Role & Security Audit (ZAI Takeover)

**Scope:** server-side authorization for every sensitive action, tenant isolation, money-flow integrity.
**Method:** code inspection + automated tests (`npm test`, `scripts/patafundi-e2e.mjs`) + manual probing.

---

## 1. Role matrix (server-enforced)

`users.role` (DB CHECK): `customer, fundi, fundi_pending, admin, super_admin,
company_admin, ops_manager, support_agent, fraud_analyst, finance_team,
dispatch_team, devops_engineer, auditor`

Company member roles (`company_members.role`, separate namespace):
`owner, manager, admin, dispatcher, finance, technician`

| Surface | Who gets in | Enforcement |
|---|---|---|
| Customer app | any authed customer | `authRequired` |
| Fundi execution endpoints | approved fundis **or** active company technicians | `requireApprovedFundi` / `requireApprovedWorker` |
| Company portal (`/company/*`) | active members of THAT company only | `requireCompanyMember` middleware (resolves membership per request; staff bypass limited to `super_admin/admin`) |
| Company finance | `owner/finance` member roles only | `COMPANY_FINANCE_ROLES` check inside `portalFinance` |
| Dispatch actions | `owner/manager/admin/dispatcher` | `COMPANY_DISPATCH_ROLES` |
| Profile/team/services writes | `owner/manager/admin` | `COMPANY_ADMIN_ROLES` |
| Staff portal (`/staff/*`) | staff roles; per-permission nav + server `requirePermission` | `requireStaff()` + permission middleware |
| Admin (`/admin/*`) | `admin/super_admin` via `requireRole('admin')` | route-level |
| Public directory (`/companies*`) | anonymous OK | customer-safe projection only |

## 2. Company (tenant) isolation — verified

- `requireCompanyMember` re-resolves membership on **every** request; suspended members rejected.
- Cross-company access attempts return **403** (unit test + E2E + the rewritten
  `company-partnership.test.js` that the old suite never truly asserted).
- Job access (`canAccessJob`) now includes company membership + assigned technician — previously customers/fundis only.
- `getCompanyPortalOverview` no longer leaks: it used to return full data to any
  authenticated user (`canAccess` computed but ignored). Fixed and tested.
- Public profile endpoints project **only** customer-safe fields
  (`publicCompanyProfile`): no settlements, commission, payroll, internal notes.

## 3. Money-flow integrity (server-authoritative)

| Control | Status |
|---|---|
| Payment amount must match server-side job value (±0.01) | ✅ (pre-existing, verified) |
| Commission split computed server-side (`financeService.calculateCommission`) | ✅ |
| Provider-suggested final price **clamped to ±25% of estimate** (tamper test: 99,000 on a 4,000 job → clamped) | ✅ NEW |
| Fundi quote revision >25% parks job as `offered` until customer approves (`decideQuote`) | ✅ NEW |
| Escrow release only after `completed` + customer OTP confirm + no open dispute | ✅ |
| Settlement rows written in one transaction (`settlementService.releaseJobEscrow`) | ✅ NEW |
| Refund voids pending settlements, debits wallet atomically | ✅ FIXED (was rejected by CHECK constraint) |
| Payout min/trust-score/fraud-freeze validations | ✅ (pre-existing) |

## 4. Fixed vulnerabilities (takeover)

1. **IDOR** — company overview returned full data to any authed user → now membership-enforced (403).
2. **Money tampering** — `acceptJob` trusted client `estimatedPrice`; `completeJob` trusted `finalPrice` → both now guarded/clamped server-side.
3. **Escrow release never worked** — illegal `escrow_transactions.status='completed'` + missing wallet tables → repaired via migration 033 + settlement service.
4. **Refunds impossible** — `payments.status='refunded'` violated CHECK → CHECK extended.
5. **Dispatch crashed** — `jobs.status='assigned'` violated CHECK → lifecycle extended; success path now under test.
6. **Arbitrary job status jumps** — added a transition state machine (invalid jumps → 400).
7. **Company members unaddable** — no invite endpoint existed → team CRUD added (temp-password provisioning).
8. **CORS on sandbox origin** — frontend origin misconfigured for the single-port proxy → fixed (`FRONTEND_ORIGIN`, `CORS_ORIGINS`).
9. **Notification writes to non-existent `message` column** in 3 services → aligned to `body`.
10. **Demo credentials in prod** — takeover seed hard-refuses production (belt-and-braces with the existing guard).

## 5. Audit logging

`audit_logs` written for: company application create/review/approve, company
profile update, member add/update/remove, job claim/accept/reject/quote/
assign/unassign, escrow release (with source + amounts), refunds, admin
company suspend/reactivate, payment initiation (+dev simulation labelled).

## 6. Known limitations (honest)

- Realtime notification rooms are per-user and per-job; company-wide fan-out
  notifies the owner user (not a group room) — acceptable at current scale.
- `refresh_tokens` rotation exists; device/session revocation UI is staff-only.
- 2FA exists for staff; company-member accounts inherit customer-grade auth
  (password + OTP email verification) — recommend enabling 2FA for finance roles.
