# PataFundi installation and verification

This guide distinguishes local development, disposable database tests, and
production. Never point test, seed, migration, reset, or audit commands at a
production database or one containing genuine customer records.

## Verified environment

- Windows, Node.js 24.20.0, npm 11.19.0
- Docker Desktop 29.8.2 and PostgreSQL 16
- Expo SDK 54; customer and Fundi apps target Android and iOS only

On this Windows setup, use `npm.cmd` / `npx.cmd` if PowerShell blocks the
`.ps1` shims.

## Install and configure

From the repository root:

```powershell
npm.cmd install
npm.cmd ls --depth=0
npm.cmd install --prefix apps\customer-mobile
npm.cmd install --prefix apps\fundi-mobile
```

Create `.env` only if it does not already exist:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set local development secrets in `.env`; do not commit them. Keep provider
credentials in environment variables or a secret manager. `DATABASE_URL` may
be empty for embedded PGlite development. Start the website and API together
with `npm.cmd run dev`, or separately with `npm.cmd run dev:backend` and
`npm.cmd run dev:frontend`.

Start mobile Metro from the repository root:

```powershell
npm.cmd --prefix apps\customer-mobile run start
npm.cmd --prefix apps\fundi-mobile run start
```

Set `EXPO_PUBLIC_API_URL` to a reachable development or staging API before
bundling for a device. A JavaScript export does not validate that URL, login,
or API behavior.

## Database testing

Without an explicit test URL, the root test preloader uses isolated temporary
PGlite directories. To use PostgreSQL, create a **disposable** database on a
loopback-only PostgreSQL 16 instance. Do not use a shared or production
database. Example container (no persistent volume; local testing only):

```powershell
docker run --rm --name patafundi-test-db `
  -e POSTGRES_HOST_AUTH_METHOD=trust `
  -p 127.0.0.1:5432:5432 postgres:16-alpine
```

In another PowerShell window, create a database whose name begins with
`patafundi_test`:

```powershell
docker exec patafundi-test-db createdb -U postgres patafundi_test_local
Set-Location C:\Users\emman\PataFundi\Patafundi-9bhsw1
$env:NODE_ENV = 'test'
$env:PATAFUNDI_TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/patafundi_test_local'
$env:DATABASE_URL = $env:PATAFUNDI_TEST_DATABASE_URL
node backend\scripts\migrate.js
```

The test preloader accepts only loopback PostgreSQL hosts and the
`patafundi_test` / `patafundi_test_*` database-name pattern. With
`PATAFUNDI_TEST_DATABASE_URL` set, a connection failure is an error; it does
not fall back to PGlite. The backend scripts serialize test files before the
test selectors. This is important because many integration files bootstrap
the same database and compete for its migration advisory lock. Use the
built-in script (or this equivalent explicit command) against one disposable
database:

```powershell
node --import ./backend/scripts/test-setup.js --test --test-concurrency=1 --test-force-exit ./backend/src/**/*.test.js ./backend/src/*.test.js
```

The complete root suite was verified against a fresh loopback PostgreSQL 16
database after all 48 migrations were applied: 136 tests passed, 0 failed.
An earlier attempt appended `--test-concurrency=1` after the file selectors;
Node still ran test files concurrently, and 18 tests failed while waiting for
the migration advisory lock (`canceling statement due to statement timeout`).
The repository scripts now place the concurrency option before the selectors.
Do not substitute a broad `node --test` discovery command: it also discovers
standalone load/live scripts that expect a running API and optional tooling.

The repository's separate E2E command uses isolated embedded storage unless a
test database is explicitly configured:

```powershell
npm.cmd run test:e2e
```

The scripts `npm.cmd run verify:live` and `npm.cmd run audit:e2e` perform
mutating live-API checks. They now refuse to run without
`VERIFY_ALLOW_MUTATIONS=true`, a configured `PATAFUNDI_DEMO_SEED_PASSWORD`,
and (for `audit:e2e`) an explicit `VERIFY_API_URL`. Use disposable local or
staging test accounts and records only. Remote test APIs additionally require
`VERIFY_ALLOW_REMOTE_MUTATIONS=true`; the known production hostname is always
rejected. Legacy scripts under `scripts\` and `frontend\scripts\` that use
demo accounts apply the same password, mutation-opt-in, and remote-host guards.
Do not point these scripts at production. The `/demo` page is development-only;
it asks for the configured password at runtime and does not embed or display it.

To validate migrations alone on a disposable PostgreSQL database, use
`DATABASE_URL` pointing at that database and run
`node backend\scripts\migrate.js`. Do not use development seed/reset scripts
as a production migration procedure. Development demo seeding is disabled in
production and allowlisted to embedded storage or explicitly opted-in local
test databases.

## Project checks

```powershell
npm.cmd ls --depth=0
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

`npm run typecheck` checks the website TypeScript project. The backend is
JavaScript and has no separate backend TypeScript script. Use the serial
PostgreSQL command above when validating DB-backed backend tests against real
PostgreSQL.

The mobile app checks are:

```powershell
Set-Location apps\customer-mobile
npm.cmd run typecheck
npx.cmd expo install --check
npx.cmd expo export --platform android
npx.cmd expo export --platform ios

Set-Location ..\fundi-mobile
npm.cmd run typecheck
npx.cmd expo install --check
npx.cmd expo export --platform android
npx.cmd expo export --platform ios
```

Both Expo configurations declare `ios` and `android` only. The separate
website is the web product; mobile web export is not a supported release
target. Expo exports produce JavaScript bundles, not signed APK/AAB/IPA
installers and not device or simulator verification.

## Current verified results and release limitations

- Root dependency tree: `npm ls --depth=0` passed.
- Fresh disposable PostgreSQL 16: migrations 001–048 applied; 48 migration
  ledger rows and 34 `is_demo` columns verified.
- Complete backend test suite on a fresh PostgreSQL database: 136/136 passed.
- The seven-test financial/demo-isolation regression suite passed against
  PostgreSQL after adding refund, chargeback, and payout assertions.
- Separate E2E command: latest rerun passed 4/4 using isolated PGlite.
- Financial/demo-isolation regression suite on PostgreSQL: 7/7 passed,
  including full refund, chargeback validation, payout reconciliation, and
  demo-finance exclusions.
- Root lint: 0 errors, 34 warnings.
- Website TypeScript check and production build passed. The generated
  910.93 kB entry chunk remains above Vite's 600 kB warning threshold.
- Customer and Fundi type checks, Expo dependency checks, and Android/iOS
  JavaScript exports passed after the non-forced audit-fix attempt.
- Fresh root `npm audit` reports 11 advisories (5 moderate, 6 high, no
  critical). Customer mobile reports 43 (20 moderate, 23 high); Fundi mobile
  reports 38 (15 moderate, 23 high). Both mobile audits exit 1. Direct Expo,
  React Native, Expo Notifications and React Navigation dependencies are
  among the affected packages; forced major upgrades were not applied.
- On a separate disposable PostgreSQL database, genuine sentinel accounts
  using reserved demo emails kept their profile, role, `is_demo=false`, and
  password hashes after `node backend\scripts\seed.js`; the takeover seeder
  refused its genuine-account collision without changing either account.
- `npm update image-size --dry-run --package-lock-only` reported "up to date";
  no compatible transitive update was produced and neither mobile lockfile was
  changed to mask this advisory.
- Compose configuration and all six Kustomize app/migration overlays rendered
  successfully. The frontend image built successfully once, but subsequent
  Compose/backend image builds were blocked by Docker Hub OAuth `HTTP/2 GOAWAY`
  and npm registry `EIDLETIMEOUT` errors. No Compose application runtime was
  started and no Kubernetes cluster was available.
- The latest PostgreSQL 16 run applied migrations 001–048 and passed 136/136
  selected backend tests after the demo seed safeguards were updated. The
  separate PGlite E2E command passed 4/4 before those seed-script-only edits.
- No live payment/notification credentials, device/simulator, signing
  certificate, app-store account, or production deployment was verified.

See [PATAFUNDI_READINESS_REPORT.md](./PATAFUNDI_READINESS_REPORT.md) for the
evidence, scope limits, and required launch actions.
