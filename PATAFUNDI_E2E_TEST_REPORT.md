# PataFundi — E2E Test Report (ZAI Takeover)

**Date:** 2026-09-26 · **Environment:** sandbox (PGlite embedded PostgreSQL, dev payment provider)
**Runner:** `node scripts/patafundi-e2e.mjs` (39 checks) + `npm test` (82 unit/integration) + Agent Browser (UI)

---

## 1. API journey suite — `scripts/patafundi-e2e.mjs`

**Result: 39 passed / 0 failed** ✅

| # | Section | Checks | Result |
|---|---|---|---|
| 1 | Demo role logins (customer, company, dispatcher, technician, ops, finance, super admin) | 7 | ✅ |
| 2 | Public company directory — customer-safe projection (no settlements/commission fields) | 5 | ✅ |
| 3 | Customer books company directly → `provider_type=company`, status `pending` | 2 | ✅ |
| 4 | Company accepts → team list → dispatcher assigns technician (`assigned_by` recorded) | 4 | ✅ |
| 5 | **IDOR**: customer & fundi blocked from `/company/portal/overview` (403) | 2 | ✅ |
| 6 | Technician assignments visible; state machine on_the_way→arrived→in_progress; **invalid transition rejected**; completion OTP issued; **tampered final price clamped to ≤125% of estimate** | 6 | ✅ |
| 7 | Dev payment → escrow held → customer OTP confirm → **settlement created with server-authoritative math** (net = gross − 15% commission); dispatcher blocked from finance (403) | 5 | ✅ |
| 8 | Review submitted; portal overview real stats; admin companies list; customer blocked from admin (403); application queue | 5 | ✅ |

## 2. Unit / integration suite — `npm test`

**Result: 82 passed / 0 failed** ✅

Covers: auth/JWT tamper, RBAC permission matrix, commission math (14 cases),
fraud bypass detection, M-Pesa phone normalization, encryption roundtrips,
financial confidentiality, geo utilities, PG config, PGlite singleton, and the
rebuilt **company-partnership suite** (apply → approve → provision, portal
access, cross-company 403, dispatch success path, finance role gating).

## 3. Browser verification (Agent Browser)

| Flow | Result |
|---|---|
| Landing `/` renders (emerald identity) | ✅ |
| `/companies` directory — real Apex card with rating/completed jobs | ✅ |
| `/companies/:id` profile — verified badge, services, guarantees, reviews | ✅ |
| `/partner-program` 4-step application form | ✅ |
| Login `company.demo` → **auto-redirect `/company`** portal | ✅ |
| Portal dashboard — real stats (incoming/awaiting dispatch/active) | ✅ |
| Portal **Finance** — settlements table, server-computed amounts | ✅ |
| Portal **Jobs & dispatch** — tabs, Accept/Send quote/Decline actions | ✅ |
| Mobile 390px — hamburger, bottom nav, card layout, no overflow | ✅ |
| Login `technician.demo` → `/technician` shows assigned job + status actions | ✅ |
| Login `customer.demo` → `/dashboard` lifecycle jobs, cancel, refer & earn | ✅ |

## 4. Security checks executed (also see PATAFUNDI_ROLE_SECURITY_AUDIT.md)

- [x] IDOR: company portal cross-user access → 403 (API + unit level)
- [x] Role escalation: customer → `/admin/companies` → 403
- [x] Finance gating: dispatcher → company finance → 403
- [x] Price tampering: `finalPrice: 99000` on a KES 4,000 job → clamped
- [x] State machine: illegal `arrived → on_the_way` → 400
- [x] Settlement math verified server-side (not client-influenced)

## 5. Environment-specific results

| Area | Status | Notes |
|---|---|---|
| PostgreSQL (embedded PGlite) | ✅ PASS | 33 migrations applied; honest mode reporting |
| Real PostgreSQL (external) | ⏸ CREDENTIAL REQUIRED | Set `DATABASE_URL`; schema is portable |
| M-Pesa / Stripe | ⏸ CREDENTIAL REQUIRED | Dev provider handles payments in dev, clearly labelled; webhook path implemented for real sandbox credentials |
| Email / SMS / Push | ⏸ CREDENTIAL REQUIRED | In-app + socket.io notifications fully working |
| Socket.io realtime | ✅ PASS | Job/payment/assignment events wired through vite proxy |
