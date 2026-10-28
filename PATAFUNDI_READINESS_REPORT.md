# PataFundi readiness report

## Executive status

**NOT READY for unrestricted real-customer use.** A fresh disposable
PostgreSQL 16 database accepted every migration and the complete 136-test
backend suite passed. Synthetic-data isolation and local financial bookkeeping
now have database-backed positive and negative regression evidence. However,
live provider flows, many customer/provider/company journeys, device builds,
and dependency advisories remain unverified or unresolved.

No production database, genuine business records, live payment, or production
credential was used.

## Database and test findings

### Verified in this run

A disposable PostgreSQL 16 instance was bound to loopback only. Fresh
`patafundi_test_*` databases were created without a persistent volume. On the
final database:

- Migrations 001–048 applied in order; the migration ledger contains 48 rows.
- The resulting public schema contains 34 `is_demo` columns.
- The complete backend test set ran serially with an explicit
  `PATAFUNDI_TEST_DATABASE_URL`: **136 passed, 0 failed**.
- The focused financial/demo-isolation regression suite passed on PostgreSQL:
  **7 passed, 0 failed**.
- A deliberately unavailable loopback PostgreSQL port produced
  `Explicit test database connection failed: connect ECONNREFUSED
  127.0.0.1:1`; this confirms an explicit PostgreSQL test request does not
  silently fall back to PGlite.

The older PGlite `tuple already updated by self`, missing catalog file, and
`:memory:` path failures were attributed in the prior investigation to shared
disk state/recovery across test workers and passing `:memory:` as a disk path.
The test preloader and PGlite lifecycle were changed to use isolated temporary
directories per worker and the no-path in-memory constructor. Those specific
errors did not recur in the current successful PostgreSQL suite.

The first final-suite invocation reproduced a test-harness failure. The first
reported test was `backend/src/company-partnership.test.js:49`; its call to
`ensureDevDatabase` timed out while acquiring advisory lock
`(1380013902, 47)` (`canceling statement due to statement timeout`). A total of
18/136 tests failed this way, with the stack pointing to
`backend/scripts/ensure-dev-db.js:342`. The command had placed
`--test-concurrency=1` after the test file selectors, so Node started test
workers concurrently and they queued for the shared migration lock. The
migrations themselves had already completed successfully. Reordering the
option before the selectors produced 136/136 passing tests on a second fresh
database. The root test scripts now put the serial setting before selectors.

One exploratory invocation of bare `node --test` (without repository test
selectors) auto-discovered standalone scripts and failed **4 of 137** items:

- `scripts/full_e2e_test.mjs` and two load-test scripts could not connect to
  `127.0.0.1:4000` because no API server was started.
- `scripts/live-auth-test.mjs` could not import `node-fetch`.

Those are not files selected by the repository's backend test globs. The
complete selected backend run is 136/136 passing. A separate initial isolation
fixture also violated the schema's `payouts_provider_check` by setting both
company and Fundi provider identifiers; the fixture was corrected to model a
company payout (company ID only), then passed on a fresh database.

### Database safety and seeding

- `PATAFUNDI_TEST_DATABASE_URL` must use loopback PostgreSQL and a database
  named `patafundi_test` or `patafundi_test_*`.
- Explicit PostgreSQL connection failures are fail-closed.
- The production seed path was exercised against a disposable PostgreSQL DB;
  the test confirmed the user-row count was unchanged and logged that demo
  accounts were skipped.
- Seed inserts now use `ON CONFLICT DO NOTHING`, avoiding a conflict race that
  could otherwise rewrite an existing account's password/profile.
- The demo seeder now skips an existing genuine or role-mismatched account and
  does not reset its password/profile. The takeover seeder refuses to proceed
  if a reserved demo email resolves to a non-demo account. The final
  PostgreSQL suite passed after these changes. A separate fresh PostgreSQL
  database contained genuine sentinel accounts using reserved demo emails:
  `node backend\scripts\seed.js` preserved their role, `is_demo=false`,
  profile, and password hashes; the takeover seeder rejected its collision
  without modifying either account.
- Mutating live-verification scripts require explicit mutation opt-in and
  configured test credentials; `audit:e2e` requires an explicit test API URL.
  Both refuse the known production hostnames. This invocation was not run
  against any remote API.
- Legacy root/frontend test scripts no longer contain static demo passwords;
  they require the configured demo secret and mutation opt-in. The browser
  demo page likewise no longer embeds credentials, accepts the password only
  at runtime, and is unreachable in production builds regardless of a public
  Vite flag. Archived copies of the old literal passwords were redacted.
- No production DB or real-account set was available for rollout verification.
  Before applying the provenance backfill in production, review rows that
  match the migration's exact known-demo identity tuples and retain a verified
  backup/rollback plan.

## Synthetic/demo isolation evidence

Migration 047 marks core marketplace and financial entities; migration 048
adds provenance for related job, communication, refund/dispute, and finance
activity. Defaults preserve existing unmatched rows as genuine (`false`), and
triggers inherit demo provenance from related users, jobs, payments,
companies, and payouts. This is schema-level protection, not just a frontend
filter.

The PostgreSQL regression runs verified:

1. A genuine eligible Fundi remains in matching; a demo Fundi is excluded.
2. A genuine company remains visible when eligible; a demo company is
   excluded from the public directory.
3. A demo subscription does not satisfy genuine company listing eligibility.
4. A genuine review affects a company rating; the synthetic review does not.
5. Demo job/payment/ledger values do not contribute to the tested revenue
   dashboard or business analytics totals.
6. Demo settlement activity is excluded from company withdrawal balance;
   genuine pending settlement and genuine requested payout math remains
   effective.
7. Full refunds produce the required refund ledger entry and state changes;
   duplicate and unsupported partial refunds are rejected.
8. Chargeback amount, provider, currency, payment status, and demo-data
   validation are covered.
9. Company payout completion reconciles exactly to whole pending settlements;
   Fundi payout and demo payout behavior are tested.
10. A non-demo user added as a member cannot access a demo company portal.
11. A previously issued token for a demo user is rejected in production mode.
12. Changing a genuine user to demo propagates to related job, payment, and
   ledger rows.
13. A production-mode `seedIfEmpty` invocation does not insert demo users.
14. Genuine user rows default to `is_demo=false`.
15. Seed policy rejects production and unsafe external database targets.

The application changes also filter demo activity in company/fundi search,
job matching/booking lookups, financial/admin reporting, payouts,
subscriptions, and related workflows. The current regression coverage does
**not** establish every path end to end: provider money movement, every
notification/history/AI analytics query, and all staff reports still need
dedicated tests. Local accounting regression tests do not establish provider
refund, chargeback, or payout completion. Production data migration effects
cannot be proven without the production dataset and must not be tested by
modifying it.

## Business workflow and external-service evidence

The selected automated suite covers authentication/RBAC cases, booking/job
creation and matching, quote lifecycle invariants, company application and
dispatch, company isolation, notifications, payout arithmetic, and the new
demo-isolation cases.

Not verified end to end in a real staging application:

- Customer OTP delivery, registration/password recovery, live search through
  the website/mobile clients, booking-to-quote-to-completion UI journey, or
  review submission.
- Fundi onboarding/document authenticity review, availability, real dispatch,
  completion confirmation, earnings, and provider payout delivery.
- Full company document/application review and notifications, services/staff
  administration, technician dispatch, quote-to-work lifecycle, and finance
  reconciliation.
- Payment provider callback authenticity in a live provider sandbox, settlement
  delivery, refund/chargeback execution, payout transfers, or subscription
  billing/expiry through provider callbacks.
- Live email, SMS, push, OCR, object-storage, or paid map-provider behavior.

No credentials for M-Pesa/Stripe or notification providers were available.
Local adapter tests do not prove provider settlement. A UI success or test
adapter response is not evidence of real payment or payout.

## Mobile dependency and platform findings

Fresh independent audits after an attempted non-forced `npm audit fix` report
**43 advisories for the customer app (20 moderate, 23 high)** and
**38 for the Fundi app (15 moderate, 23 high)**. Each has 23 high advisories.
The audit output identifies these vulnerable
transitive dependency families:

- `braces` through `micromatch`, Jest/Metro, and Expo CLI chains (high).
- `decode-uri-component` through `query-string` and React Navigation (moderate).
- `image-size` image parser denial-of-service advisories (high).
- `node-forge` through Expo code-signing/config tooling (high).
- `postcss` through Expo/Metro configuration (high).
- `sprintf-js` through `argparse` / `js-yaml` / test tooling (moderate).
- `uuid` through `xcode` / Expo config plugins (moderate).

Most affected packages are transitive, but direct dependencies include Expo,
React Native, Expo Notifications, and React Navigation packages. Other
findings reach Metro/Jest, Expo config/signing, and build tooling. Runtime
exposure depends on which code is shipped and invoked; the audit remains a
release risk regardless. npm's
suggested force remedies include downgrading Expo to 44, moving React Native to
0.88, or upgrading navigation across a major version. Those incompatible
changes were not forced. The non-forced attempt emitted a peer-resolution
warning, left the advisory count unchanged, and was followed by passing app
type checks, Expo SDK checks, and Android/iOS exports. Triage and a
compatibility-preserving remediation plan remain required.

The separate `npm update image-size --dry-run --package-lock-only` check
reported `up to date` and proposed no package change. No dependency override,
forced major upgrade, or lockfile deletion was used; the advisories remain.

Both `app.json` files declare Android and iOS only. The public website is a
separate web application. Mobile web export is therefore not a supported
release gate; no native map behavior was changed to support mobile web.

## Current check results

| Check | Result |
|---|---|
| Root `npm ls --depth=0` | Exit 0 |
| Customer and Fundi `npm ls --depth=0` | Exit 0 for both dependency trees |
| PostgreSQL migrations | Exit 0; fresh PG16 DB, migrations 001–048; 48 ledger rows |
| Complete backend suite on fresh PostgreSQL | Exit 0; 136/136 passed, 0 failed |
| Focused financial/demo-isolation PostgreSQL regressions | Exit 0; 7/7 passed |
| Explicit PostgreSQL failure safety check | Exit 0; expected ECONNREFUSED surfaced, no fallback |
| `npm.cmd run test:e2e` | Exit 0; latest rerun 4/4 passed on isolated PGlite |
| `npm.cmd run lint` | Exit 0; 0 errors, 34 warnings |
| Website typecheck | Exit 0 |
| Website production build | Exit 0; 2,966 modules; 910.93 kB entry chunk warning |
| Customer mobile typecheck / Expo SDK check | Exit 0 / up to date |
| Customer Android and iOS Expo exports | Exit 0 |
| Fundi mobile typecheck / Expo SDK check | Exit 0 / up to date |
| Fundi Android and iOS Expo exports | Exit 0 |
| Root `npm.cmd audit` | Exit 1; 11 advisories (5 moderate, 6 high, 0 critical) |
| Customer mobile `npm.cmd audit` | Exit 1; 43 advisories (20 moderate, 23 high) |
| Fundi mobile `npm.cmd audit` | Exit 1; 38 advisories (15 moderate, 23 high) |
| `npm update image-size --dry-run --package-lock-only` | Exit 0; up to date, no compatible package change |
| Compose config and six Kustomize overlays | Exit 0; configuration valid and overlays rendered |
| Docker image builds | Frontend image built successfully once; subsequent Compose/backend rebuilds were blocked by Docker Hub OAuth `HTTP/2 GOAWAY` and npm `EIDLETIMEOUT`; no Compose runtime started |
| Mutating verification script safety | Default invocation of `audit:e2e` refused without explicit test API; `verify:live` refused without opt-in; no remote API called |
| GitHub Actions CI | Not run remotely; local YAML/config review only. The security-audit job is expected to fail until the current high advisories are addressed |
| Broad bare `node --test` discovery (not repository test selector) | Exit 1; 133 passed, 4 standalone script failures as described above |

The Expo exports are JavaScript bundles only. No native installer was built or
signed; no physical device or simulator was available. No browser-driven live
website journey, production deployment, or production database was tested.

## Files changed in this readiness work

The worktree also contains pre-existing edits; none were reverted. Key files
changed for the current database, isolation, financial, and deployment work:

- Database/test lifecycle: `package.json`,
  `backend/scripts/test-setup.js`, `backend/scripts/ensure-dev-db.js`,
  `backend/scripts/migrate.js`, `backend/src/db.js`,
  `backend/src/pglite-instance.js`, `backend/src/server.js`, and
  `backend/src/queueWorker.js`.
- Synthetic-data model and regressions: migrations
  `backend/migrations/047_synthetic_data_isolation.sql` and
  `backend/migrations/048_synthetic_activity_isolation.sql`,
  `backend/src/demoDataPolicy.js`, `backend/src/demo-data-isolation.test.js`,
  and related auth, marketplace, admin, finance, and analytics controllers
  and services.
- Financial correctness: `backend/src/services/refundReversalService.js`,
  `backend/src/controllers/chargebackController.js`,
  `backend/src/controllers/payoutController.js`, and the associated
  PostgreSQL tests.
- Container and deployment configuration: `Dockerfile.backend`,
  `Dockerfile.frontend`, `docker-compose.yml`, `docker-compose.dev.yml`,
  `frontend/nginx.conf`, `.dockerignore`, `deploy/k8s/`, and
  `DOCKER_KUBERNETES_GUIDE.md`.
- App configuration and reports: customer/Fundi mobile `app.json`,
  `package.json`, and `tsconfig.json`; `INSTALLATION_AND_READINESS.md`;
  `PATAFUNDI_READINESS_REPORT.md`.
- Seed credential/collision safety and live-script guards:
  `backend/scripts/seed.js`, `backend/scripts/seed-takeover.js`,
  `backend/scripts/live-verification.js`, and
  `backend/scripts/e2e-production-audit.js`. Root/mobile lockfiles and CI
  audit jobs were also updated; hosted CI has not run.
- Demo credential exposure cleanup: `scripts/demo-password.mjs`, test scripts
  in `scripts/` and `frontend/scripts/`, `frontend/src/pages/DemoPage.tsx`,
  `frontend/src/routes/AppRoutes.tsx`, and `frontend/src/pages/staff/StaffLogin.tsx`.

`git status --short` and `git diff --stat` remain the authoritative complete
worktree listing; changes were not committed.

## Subsystem classification

| Subsystem | Status | Evidence / remaining gap |
|---|---|---|
| Test harness and PGlite isolation | **READY** | Isolated temporary directories; historical failure modes fixed; no recurrence in current runs |
| PostgreSQL migration and backend suite | **READY** | Fresh PG16; all 48 migrations; complete 136/136 suite passes with serialized file execution |
| Synthetic-data controls | **PARTIALLY READY** | Database-backed listing, rating, matching, revenue, subscription, balance, auth, seed, and provenance tests pass; not every operational read/write path is covered |
| Backend business workflows | **PARTIALLY READY** | Core booking/quote/company/RBAC tests pass; extensive staging journeys remain unverified |
| Website | **PARTIALLY READY** | Typecheck/build pass; no live user workflow verification; large entry chunk warning |
| Customer mobile, Android/iOS | **PARTIALLY READY** | Typecheck and JS exports pass; no native build, device, or live API validation |
| Fundi mobile, Android/iOS | **PARTIALLY READY** | Typecheck and JS exports pass; no native build, device, or live API validation |
| Authentication and authorization | **PARTIALLY READY** | Selected token/RBAC tests pass; OTP delivery and complete client journeys unverified |
| Payment/refund/payout accounting logic | **PARTIALLY READY** | PostgreSQL tests cover refund ledger/state/idempotency, chargeback validation, and payout reconciliation; external transfers and provider callbacks are not proven |
| Live payments, refunds, payouts, subscriptions | **BLOCKED** | No M-Pesa/Stripe sandbox credentials or settlement evidence; local tests do not prove money movement |
| Email/SMS/push/OCR/storage/paid maps | **BLOCKED** | External credentials and delivery verification unavailable |
| Mobile dependencies | **NOT READY** | Customer: 43 (20 moderate, 23 high); Fundi: 38 (15 moderate, 23 high); safe compatible complete remediation not established |
| Container/Kubernetes deployment | **PARTIALLY READY** | Compose/Kustomize configuration renders and frontend image built once; later rebuilds hit registry/network errors; no live Compose runtime or cluster validation |
| Production deployment and device release | **BLOCKED** | No staging deployment, signed native artifacts, device tests, or store validation |
| Overall readiness | **NOT READY** | Security, live workflow, provider, staging, and release gates remain open |

## Required actions before real customers

1. Triage every mobile advisory and implement a tested Expo-compatible
   remediation; rerun both audits and native checks.
2. Rebuild the frontend Docker image after resolving or retrying the
   package-download `ECONNRESET`; then run a disposable Compose startup,
   readiness, persistence, and shutdown check.
3. In staging, exercise the complete customer, Fundi, company, admin, staff,
   finance, refund, payout, and subscription journeys using disposable records.
4. Add targeted isolation tests for settlement, admin/staff report,
   notification/history, and AI analytics paths.
5. Validate M-Pesa/Stripe and notification callbacks with genuine sandbox
   credentials, including signature verification, replay/idempotency, amount
   and currency checks, failure/retry, and reconciliation.
6. Run the provenance migration against a reviewed staging snapshot; inspect
   each row that would be marked synthetic before a controlled production
   migration. Never reset or bulk-alter production data to test this.
7. Produce signed Android/iOS builds and test login, API URL selection,
   location permission handling, job/quote flows, notifications, and offline
   errors on supported devices or simulators.
8. Reduce or explicitly budget the website's 910.93 kB entry chunk; rerun the
   production build and browser checks.
9. Complete production secrets, HTTPS/cookie, backups/recovery, monitoring,
   access control, privacy/legal, rollout, and rollback review.

No production data reset, commit, or push was performed in this review.
