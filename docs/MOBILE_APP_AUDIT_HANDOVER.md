# PataFundi mobile repository audit and handover

**Audit date:** 10 October 2026
**Source of truth:** `Evian1k/Patafundi-9bhsw1` (`main`)
**Scope:** inspect the existing monorepo and repair the two Expo mobile apps without creating a second backend/database or modifying configured business data.

## Existing architecture confirmed

- `apps/customer-mobile` and `apps/fundi-mobile` are separate Expo/React Native applications with their own navigation, role-specific screens, app configuration, and dependency manifests; they are not WebView wrappers.
- Both use `packages/shared` for the common API client, authentication/session store, visual tokens, and cross-app contracts.
- `backend/` is the shared Express API with PostgreSQL migrations and business controllers. `frontend/` remains the separate web application, with company, technician, staff, and administrator route groups connected to the same backend.
- The repository contains 46 SQL migration files. The application source declares a broad existing API surface; this audit did not assume that source presence alone proves every production workflow.
- No referral or loyalty UI/API was found in the inspected customer/Fundi mobile and web surfaces; migration `037_remove_referrals_loyalty.sql` is present.

## Repairs in this change

- **Customer role isolation:** the customer app now accepts only `customer` accounts. Other roles are directed to their proper PataFundi workspace rather than being implicitly admitted.
- **Honest Fundi verification state:** the API now returns top-level `status` and `message` while preserving the nested `fundi` record. Approved status is rechecked after the current user refreshes; `not_registered` is distinct from pending; and a status outage remains retryable instead of being presented as a review decision.
- **Session handling:** invalid/expired refresh JWTs return an authentication error. Mobile token refresh distinguishes invalid credentials from transient network, rate-limit, and server failures; retryable failures preserve the session. Expired sessions clear local auth state, and profile-refresh failures no longer silently sign the user out.
- **Expo SDK 54 dependency alignment:** both apps now declare `expo-secure-store ~15.0.8` (the installed SDK 54-compatible version), and the shared package peer range accepts that package family.
- **Native build preset:** both mobile apps now declare `babel-preset-expo ~54.0.12`, which their Babel configurations require. Without it, Metro export failed for both apps.
- **Mobile TypeScript in the monorepo:** each app resolves shared dependencies and React 19 declarations from its own installed SDK dependency tree; a narrow compatibility declaration retains existing `JSX.Element` return annotations while the apps use React 19 types.
- **Shared theme build defect:** removed a duplicate `JOB_STATUS_LABELS` declaration that made the shared package fail TypeScript compilation.
- **Safe backend tests:** `npm test` now uses a sequential runner and a disposable PGlite database in the OS temporary directory. It refuses to run under `NODE_ENV=production`, clears the database URL and external-provider variables for the test child, and removes the scratch directory afterward. The new approval-status builder regression is a pure test and does not write to a database. The test runner does not migrate, reset, or seed the configured application database.
- **Documentation:** README architecture and migration/test guidance now reflect the audited monorepo and current test workflow.

## Validation run

| Check | Result |
|---|---|
| Backend test suite (`npm test`) | **132 passed, 0 failed**, against disposable PGlite |
| Backend end-to-end suite (`npm run test:e2e`) | **5 passed, 0 failed**, against disposable PGlite |
| Root frontend TypeScript check | Passed |
| Root production frontend build | Passed; Vite emitted a large-chunk advisory (largest JS chunk about 911 kB) |
| Root lint | Passed with **0 errors** and 34 warnings |
| Customer Expo TypeScript check | Passed |
| Fundi Expo TypeScript check | Passed |
| Expo SDK dependency check, both apps | Passed after dependency alignment |
| Customer Expo JS export, Android and iOS | Passed |
| Fundi Expo JS export, Android and iOS | Passed |
| Native signed APK/AAB/IPA, device testing, store release | **Not performed**; JS export is not a native signed release build |

These checks verify code-level compilation and bundling only; they do not certify production integrations, device permissions, or every master-prompt acceptance condition.

## Data and environment safety

No configured/live database was reset, seeded, migrated, or written to for this audit. In particular, `npm run db:push` was not run: the repository documentation says that command migrates and seeds demo accounts. The test runner operates only on its temporary PGlite database.

No Vercel/Render deployment was triggered and no production database, payment account, object-storage account, email provider, maps project, Expo account, or mobile-store credential was accessed.

## Remaining items before claiming production readiness

1. **Database-managed service catalog is not yet complete in the mobile clients.** The Customer and Fundi selection screens still consume `SERVICE_CATEGORIES` from `packages/shared/src/theme.ts`. The backend exposes `GET /global/services/:countryCode`, but that handler reads `country_service_categories`; the migration defines that table without a catalog seed or CRUD endpoint in the inspected source. The master-prompt requirement for an admin-managed, database-driven catalog (including free-text requests for unlisted services) therefore remains open and should not be represented as complete.
2. **Third-party integration verification requires real configuration.** The repository's `.env.example` documents application/provider settings such as `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `MPESA_*`, `RESEND_API_KEY`, `R2_*`, and `GOOGLE_MAPS_SERVER_KEY`. No credential values were added to source or verified against live provider accounts. Payment callback signing/reconciliation, email delivery, private object storage, and production maps remain unverified.
3. **Runtime/device requirements remain unverified.** No physical-device or emulator run was performed for camera/photo permissions, GPS behavior, push notification delivery, deep links, offline recovery, secure storage, or accessibility behavior.
4. **Release/deployment access remains required.** Android/iOS signing and developer accounts, Expo/EAS build access if used, and authorized Vercel/Render deployment access are needed for native release artifacts and deployment verification. No app-store publication is claimed.
5. **Broader master-prompt audit remains incomplete.** Passing the current automated suite does not establish full coverage of company/staff flows, live payment/provider integrations, backup/restore, or every listed authorization, notification, dispute, refund, and financial-ledger acceptance condition.

The important next product step is to complete the persisted catalog and its authorized management workflow without overwriting existing company or marketplace data, then add focused tests and exercise it against a disposable integration database before any production migration.
