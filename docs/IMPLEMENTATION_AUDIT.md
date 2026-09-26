# PataFundi — Master Implementation Audit (Phase 0)

Date: 2026-09-26 · Scope: full repository at commit `8b9b57f` · Method: two independent deep audits (backend, frontend) + manual verification of every destructive change before execution.

## 1. Repository inventory (what exists)

| Area | Location | State |
|---|---|---|
| Backend API | `backend/` — Express 5, PGlite embedded Postgres, 33 migrations, ~270 endpoints in 24 controllers | Real, substantially complete |
| Web app | `frontend/` — React 18 + Vite + TS + shadcn/ui, single role-aware router | Real, substantially complete |
| Customer mobile | `apps/customer-mobile/` — Expo/React Native, 20+ screens | Restored this phase (was wrongly deleted) |
| Fundi mobile | `apps/fundi-mobile/` — Expo/React Native, 24 screens | Restored this phase |
| Shared mobile lib | `packages/shared/` — `@patafundi/shared` (API client, auth store, theme) | Restored this phase |
| DB | PostgreSQL via PGlite (dev) / `DATABASE_URL` (prod), migrations 001–033 | Real |
| Payments | M-Pesa Daraja STK push + webhook + dev simulator (labelled) | Real (B2C payout is manual) |
| Realtime | Socket.IO, JWT handshake, authorized job rooms | Real, 2 leak bugs found |
| Deploy | Render blueprint + Vercel; docker-compose has Postgres only; **no Dockerfile** | Partial |
| CI | `.github/workflows/ci.yml` — lint/typecheck/build only, **no tests** | Partial |
| Tests | 13 unit/e2e files (82 tests) + E2E journey scripts | Real, not run by CI |

## 2. Classification summary

**Implemented (do not change):** auth core (bcrypt, JWT rotation, OTP hashing/lockout), RBAC permission system + staff department matrices, company tenant isolation (`companyAccess`), money path (payment → escrow → settlement → ledger → payout with `FOR UPDATE` + idempotency + webhook signature/replay protection), file storage (sharp re-encode, signed URLs, doc access audit), fraud engine, error model (reference codes, staff routing), audit logging coverage, chat bypass detection, mobile-first responsive layouts.

**Broken (fix):**
1. Pricing engine 500s at runtime — queries `fundis.is_online` (real column: `online`) and `fundis.tier` (real: `fundi_tier`).
2. `createJob` trusts client `estimatedPrice` verbatim; pricing engine never invoked at booking.
3. Staff console breaks in production — `StaffLayout`/`StaffOverview`/`StaffDataTable` use raw `fetch("/api/...")` which Vercel rewrites to index.html.
4. Job state machine bypasses — `checkIn` writes any status; `completeJob` allows `arrived → completed`.
5. Fraud alerts route only to `role='admin'`; platform owner is `super_admin` → CEO never alerted.
6. Realtime leaks — `payout:requested` broadcast to all clients; completion OTP broadcast to job room including the fundi; company members cannot join job rooms.
7. Payout double-spend race — balance check without row locks.

**Mocked/unsafe (remove/label):** fabricated "Dispute opened" timeline in admin DisputeManagement; demo-mode fallback shows fake wallet balance on API error; commission breakdown returned to customers by `POST /pricing/calculate`; TOTP secrets stored plaintext; `changePassword` lacks strength check and does not revoke refresh tokens; `updateMe` overwrites encrypted phone with plaintext.

**Missing (build, small + useful):** notification center UI (backend + API client ready, zero UI); customer quote approval surface (companies can quote, customer cannot respond); receipt view after payment; fundi profile-edit + my-reviews pages; technician GPS check-in + evidence upload; job expiry reaper; post-job chat policy; `/ready` endpoint; Dockerfiles; CI test job.

**Duplicated (removed after verification):** root `src/` scaffold (199 files, no build entry references it — superseded by `frontend/`); duplicate route registrations `/staff/revenue` (routes.js:234,317) and `/admin/users/:id/force-logout` (routes.js:196,648); workspace artifacts (`tool-results/`, `skills/`, `.agents/`, `download/`) untracked.

**Must NOT change:** established emerald/teal design identity, glass headers, card patterns, working money flow, RBAC matrices, the 12-demo-account seed, mobile-first layout patterns.

## 3. Implementation order (this takeover)

1. Backend correctness batch (gaps 1–7 + MFA enforcement + chat policy + expiry + hardening misc)
2. Frontend connect batch (prod breaker, notification center, quote approval, receipt, mock removal, fundi profile/reviews, technician check-in)
3. Design modernization pass (staff console, company portal, customer dashboard — token-based, identity-preserving)
4. Mobile apps: install, typecheck, host-config verification
5. Docker-first + CI tests
6. Full verification matrix + final report

## 4. Final verification matrix (evidence)

| Check | Result |
|---|---|
| Backend unit + embedded-DB e2e suite (`npm test`) | 82 / 82 pass |
| E2E journey (`node scripts/patafundi-e2e.mjs`) — login → booking → dispatch → work → payment → escrow → settlement → review + isolation checks | 41 / 41 pass |
| Security probe battery (`node scripts/security-probe.mjs`) — IDOR, tenant isolation, token tampering, missing auth, role walls, completion-code access, commission stripping, payment trust, webhook, rate limiting, chat policy, error intake | 16 / 16 pass |
| TypeScript (`tsc --noEmit -p frontend/tsconfig.app.json`) | clean (was silently failing before) |
| Production build (`npm run build`) | pass |
| Expo customer-mobile: tsc + `expo export --platform android` | clean + bundle produced |
| Expo fundi-mobile: tsc + `expo export --platform android` | clean + bundle produced |
| Browser verification (agent-browser) | staff login → console (dark-emerald), company portal dashboard, customer dashboard with notification bell — all rendering correctly at 1440px |

## 5. Implementation log

- `git show 191b20c` inspected before any restore; `apps/` + `packages/` restored from `f3556ee` because they are unique assets (not duplicates); root `src/` deletion kept because it was superseded (root `package.json` scripts reference only `backend/` + `frontend/`).
- Backend/frontend audits: every claim above has file+line evidence in the working notes; fixes are validated with the existing 82-test suite, typecheck, production build, E2E journey script, and targeted API probes.

- Commit `8b9b57f` — unify: restored Expo apps + shared package, untracked workspace artifacts, README monorepo structure.
- Commit `7d475d9` — backend hardening: server-authoritative pricing at booking, pricing-engine column fixes (`online`, `fundi_tier`), commission confidentiality on `/pricing/calculate`, MFA challenge at login + TOTP secrets encrypted at rest, state-machine enforcement (check-in/complete), payout double-spend row lock, realtime room authorization (staff ops room, company-member job rooms, no OTP/payout broadcasts), post-job chat policy, job expiry reaper + migration 034, `/ready` probe, quality-score RBAC.
- Commit `8cc1741` — frontend connect + modernize: production staff-console fetch fix, notification center, quote approval, receipt, resend completion code, fundi profile/reviews, technician GPS check-in + evidence, honest empty/error states, deep-emerald staff/admin chrome + token cleanup across company/customer.
- Commit `60af272` — mobile verification: monorepo Metro config, AsyncStorage 3.x compatibility, env-driven API base.
- Commit `6f0a96d` — Docker-first stack + CI (tests + image builds).
