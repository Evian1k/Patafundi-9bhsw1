# PataFundi — Master Implementation Prompt: Final Report (§39)

Date: 2026-09-26 · Branch: `main` · Scope: PHASE 0–12 execution of the master
implementation prompt ("use this instead" spec). Method per spec: Inspect →
Plan → Modify → Test → Report. **Nothing was rebuilt** — all work preserved the
existing emerald/dark premium UI and corrected behavior/authorization gaps.

---

## 1. Repository status

| Item | Status |
|---|---|
| Structure | Single source of truth: `backend/` + `frontend/` + `apps/{customer-mobile,fundi-mobile}` + `packages/shared`. Stale duplicate clone (old root `src/`, `App.tsx`, ~25 outdated audit reports) deleted after verification (ancestor commit, zero uncommitted changes). |
| Duplicate risk items verified as ACTIVE (kept) | `packages/shared` (imported by 52+29 mobile files), Expo apps (spec-mandated), root configs (monorepo orchestrators), `.zscripts` (workspace runtime). |
| Migrations | 35 SQL migrations (`001`→`035_subscription_payments.sql`). `035` fixes the subscription lifecycle (metadata column + pending/failed statuses). |

## 2. Implementation status (PHASE 0 audit → fixes)

### Fixed in this run (verified by tests)

1. **Commission confidentiality (spec: fundi never sees platform commission)** —
   `GET /payments/job/:jobId` returned `select p.*` including
   `platform_commission/commission_rate/commission_type/commission_details` to
   fundi AND customer. Added `sanitizePaymentForParty()` (staff roles keep the
   full row). Battery evidence: fundi/customer views hide all 4 fields; admin
   view retains them.
2. **Subscription payments were broken end-to-end** — status CHECK forbade
   `'pending'` (insert crashed) and there was no `metadata` column (webhook
   matching impossible). Migration `035` + route fix.
3. **Subscription pricing was client-authoritative** — `req.body.amount` was
   charged. Now `SUBSCRIPTION_PLAN_PRICES` (server map) decides the amount;
   unknown plans rejected. Battery: tampered vs normal requests behave
   identically; bogus plan → 400.
4. **M-Pesa webhook never activated subscriptions** — webhook now matches
   `subscriptions.metadata->>'checkout_request_id'`, verifies amount + receipt,
   activates row-locked and idempotently (replay-protected via
   `processed_webhook_callbacks`), duration derived from the server-side plan,
   and notifies ONLY the fundi (notification isolation — no job-room emit).
5. **Job state machine had a weak role matrix** — any job party (customer!)
   could drive `matching→accepted`, `accepted→assigned`, etc. New
   `JOB_STATUS_ACTORS`: provider transitions (en_route/arrive/in_progress/
   completion_requested) are assigned-fundi-only; completion confirmation from
   `completion_requested` is customer-only; scheduling is customer/company;
   `failed/expired` admin-only. Battery: customer self-accept → 403,
   customer `on_the_way` → 403, super_admin drives → 200.
6. **super_admin was invisible to object-level checks** — 17 literal
   `role === 'admin'` comparisons denied the platform owner (over-strict, and
   inconsistent with `requireRole` back-compat). Added `isAdminRole()` +
   `req.user.isAdmin`; applied across job/payment/storage/worker/fundi access.
7. **Webhook secret enforcement was dead code** —
   `requireCallbackSecretInProduction` existed but was never called. Now wired
   at server boot: production fails fast when `MPESA_CALLBACK_SECRET` is
   missing.
8. **Socket staff room trusted the JWT role** (stale up to 15 min after
   demotion/suspension) — live DB role+status re-check before granting
   `staff:ops`.
9. **Device-token DELETE was an IDOR** — any authenticated user could
   deactivate any push token. Now scoped to the owner (battery: cross-user
   delete → 404). Also made the check driver-agnostic (`RETURNING`+rows;
   PGlite `rowCount` unreliable — the bug had silently passed).
10. **`/geo/controls`, `/geo/service-radius`, `/enterprise/feature-flags` GET**
    were any-authenticated — now permission-gated (battery: customer → 403).
11. **Fraud-report job references were unverifiable** — reporter can now only
    attach a job they are a party to (strip otherwise, report still accepted).
12. **Chat attachments + local file serving** — company members/technicians
    could read chat but not its attachments; access now aligned with
    `assertJobAccess` participant policy.
13. **Frontend crash boundary covered 1 of ~60 routes** — `RouteErrorBoundary`
    (friendly message + `/api/client-errors` report to DevOps) is now mounted
    globally in `App.tsx`.
14. **Dark-theme token drift** — `.dark` primary was amber; corrected to
    emerald (`160 84% 39%`) to match the brand identity. No other visual
    changes (UI untouched per spec §"existing UI is the visual truth").
15. **`REFRESH_SECRET` naming bug** — compose passed `REFRESH_SECRET` while the
    backend reads `REFRESH_TOKEN_SECRET` (in Docker the refresh secret silently
    fell back to the JWT secret). Fixed in `docker-compose.yml` + CI.
16. **Mobile hardcoded LAN IP `192.168.0.106`** in dev scripts — removed;
    endpoints come from `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_HOST` env vars;
    per-app `.env.example` added (Android emulator default `10.0.2.2`, prod
    fallback = Render origin). Dead `extra.API_URL` app.json config removed.
17. **`.env.example` completeness** — documented `ENCRYPTION_KEY` (PII
    encryption; was silently absent), `EXPO_PUBLIC_*`, `FCM_SERVER_KEY`,
    `FIREBASE_PROJECT_ID`, `PATAFUNDI_EMBEDDED_DB`, `PATAFUNDI_PGDATA_DIR`,
    `BACKUP_DIR`, `NOMINATIM_USER_AGENT`, `HOST`, deploy-metadata vars.

### Verified strong (no changes needed — preserved)

- Auth: HS256-pinned JWT (iss/aud validated), 15-min access tokens, rotating
  refresh tokens (SHA-256 hashed, revoked on logout/reset), bcrypt cost 12,
  account lockout, TOTP 2FA at login, CSRF double-submit, per-IP rate limits.
  Authorization re-fetches the live DB role on EVERY HTTP request (banned
  users blocked immediately despite token TTL).
- Money: single authoritative escrow-release path (`settlementService`) with
  idempotency + dispute/freeze gates; server-recomputed payment amounts
  (client amount deviations > 0.01 rejected); webhook replay protection;
  revenue_ledger + accounting_ledger double-entry on payment; expected-
  commission anti-bypass loop (15-min checks, commission debts).
- Notifications: strictly per-user rows; completion OTP emitted only to the
  customer's room, never the job room; staff operational alerts on separate
  audience paths.
- Realtime: JWT handshake, per-IP connection cap, `job:subscribe` DB-authorized,
  `staff:ops` role-gated, fundi location re-checks assignment before re-emit.
- Error routing (spec §20): classifyError + ERR-XXXXXX references +
  category→staff-role routing with 10-min dedupe + `/client-errors` intake +
  staff error-log viewer. Working (previous run + global boundary now covers
  all routes).

## 3. Feature status by world

| World | Status | Notes |
|---|---|---|
| Customer (web) | ✅ Working | job create→pay→track→confirm; routes server-enforced; boundary global |
| Customer (Expo) | ✅ Working (dev) | 40 screens; env-var endpoints; real-device ready via EXPO_PUBLIC_* |
| Fundi (web) | ✅ Working | acceptance, wallet, payouts; commission hidden |
| Fundi (Expo) | ✅ Working (dev) | 24 screens; pending-approval phase; location streaming |
| Company portal | ✅ Working | membership middleware + tenant isolation verified by earlier IDOR tests; notifications bell absent (known gap, cosmetic) |
| Staff portal | ✅ Working | permission RBAC; error-logs viewer; per-child routes rely on API 403 (by design — backend is the boundary) |
| Super Admin | ✅ Working | object-level super_admin recognition fixed this run |
| Subscriptions | ✅ Fixed | was crashing on insert; now full pending→active lifecycle via webhook |

## 4. Security status

- IDOR: job/quote/wallet/escrow/notifications/sessions/documents/disputes/
  chat verified scoped; device-token hole closed this run.
- RBAC: backend is the boundary; frontend guards are UX-only (documented).
- Webhook: secret-or-HMAC verification, replay table, amount match,
  production fail-fast.
- Evidence: `scripts/security-battery.mjs` — **19/19 PASS** against a live
  seeded server (RBAC walls ×4, state-machine principals ×4, commission
  confidentiality ×4, device IDOR ×2, webhook ×2, subscription authority ×2,
  job creation/acceptance/pay ×3).

## 5. Payments status

- Provider: M-Pesa Daraja (STK push) — keys backend-only; dev simulator
  (clearly labelled, non-production only) applies identical escrow hold.
- Server-controlled: every money/status transition server-side; escrow release
  requires `completed` + customer confirmation + no open dispute.
- Ledger: revenue_ledger + accounting_ledger populated on payment & payout
  fees. **Known limitation (documented, not hidden): refunds reverse the
  fundi wallet + revenue ledger but do not yet write an accounting_ledger
  reversal row nor call M-Pesa reversal; payout completion has no B2C call
  (off-system movement). Real-money launch requires wiring these to Daraja
  B2C/reversal APIs.**

## 6. Mobile status

- Both Expo apps: no localhost/127.0.0.1 in app source; endpoints resolved at
  runtime from env vars with a production fallback; shared package
  (`@patafundi/shared`) drives api/auth/theme/UI.
- EAS submit config still contains placeholders (`your-apple-id@example.com`)
  — store submission is NOT configured (requires the owner's Apple account).

## 7. Infrastructure status

- Docker: `Dockerfile.backend` (healthcheck `/ready`, prestart migration
  bootstrap), `Dockerfile.frontend` (multi-stage nginx, same-origin `/api` +
  `/socket.io` proxy), `docker-compose.yml` (postgres:16, service_healthy
  gating, correct `REFRESH_TOKEN_SECRET`), dev compose aligned to
  postgres:16. Compose files parse-validated (docker daemon not available in
  this sandbox — GitHub Actions `docker-build` job builds both images on push).
- CI: unit tests, typecheck, frontend build, docker builds, security audit.
  Lint + audit are `continue-on-error` (non-blocking, kept intentionally).
- Render: healthcheck `/health`, `sync:false` secrets — correct names used.

## 8. Testing status (evidence)

| Suite | Result |
|---|---|
| Backend unit tests (`npm run test:unit`) | **82/82 PASS** |
| TypeScript (`npm run typecheck`) | clean |
| Frontend production build (`npm run build`) | success |
| Security battery (live server) | **19/19 PASS** |
| Migration 035 | applied on boot (server log) |

Test coverage remains thin in these areas (pre-existing, unchanged):
payment webhook E2E, escrow release E2E, socket room authorization, mobile
apps (typecheck only, never run in CI).

## 9. Failures / open items (honest list, per §39)

1. **Refund ledger reversal + M-Pesa reversal call** — not implemented
   (requires Daraja reversal API credentials to test end-to-end).
2. **Payout completion has no provider B2C call** — money movement is
   off-system by design until Daraja B2C is configured.
3. **Client-estimate fallback in `createJob`** — jobs in categories without
   pricing config accept the customer's declared budget (documented
   `pricingSource='client_estimate_fallback'`, clamped at completion/payment).
   Rejected changing it: would break job creation for unconfigured categories;
   escrow amount remains server-stored.
4. **EAS submit placeholders** — store submission unconfigured (owner's
   Apple/Google credentials required).
5. **CI does not run mobile typechecks or compose smoke tests** — flagged;
   adding them requires Expo CI cost decisions (kept out of this run's scope
   to avoid spec-without-approval changes to billing-relevant CI).
6. **Notification pagination** — list capped at 100 rows (no cursor
   pagination) — cosmetic/perf, noted.

## 10. Definition of Done

- [x] No rebuild; existing UI/design system preserved (only token-drift fix)
- [x] Backend authorization verified/added per endpoint (battery evidence)
- [x] Notification isolation (customer vs staff vs fundi vs company)
- [x] Money states server-controlled; ledger maintained; commission hidden
      from fundi/customer
- [x] Job state machine with illegal-transition + principal blocking
- [x] M-Pesa-first payments, backend-only keys, verified idempotent callbacks
- [x] Mobile env-var endpoints, no hardcoded hosts
- [x] Docker-first infra with healthchecks and correct env names
- [x] `.env.example` documents all environment variables
- [x] Security test battery with live evidence
- [x] All secrets out of the repo (`.env.example` only; token stored in CI
      env, not committed)
