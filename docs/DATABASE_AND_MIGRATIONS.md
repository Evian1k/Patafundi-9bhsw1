# Database and migrations

PostgreSQL is the persistent application database. PGlite is supported for
isolated development and lightweight tests; it is not evidence of PostgreSQL
integration behavior. Never point test, seed, reset, or migration commands at
production.

## Migrations

SQL migrations are in `backend/migrations/`, filenames sort lexically, and
the current schema consists of 001-048. Both
`backend/scripts/migrate.js` and development bootstrap use the migration
ledger and PostgreSQL advisory lock `(1380013902, 47)`. Each SQL file is
applied in a transaction and recorded in `schema_migrations` only after
success. A failed migration rolls back that file; it does not automatically
reverse earlier successful migrations.

For an explicitly selected non-production PostgreSQL database:

```powershell
$env:DATABASE_URL = '<connection string for the intended database>'
node backend\scripts\migrate.js
```

Review the endpoint and database name out of band before execution. Do not
paste connection strings into logs, issues, or reports. Production schema
changes need a reviewed backup, staging rehearsal, deployment coordination,
and a documented rollback/forward-fix plan.

## Disposable PostgreSQL tests

The test preloader's `PATAFUNDI_TEST_DATABASE_URL` accepts only loopback
PostgreSQL with a database named `patafundi_test` or `patafundi_test_*`.
When explicitly set, connection failure is fatal; it must not silently choose
PGlite. Test files run serially because they bootstrap shared database state.
From PowerShell with the disposable database already created:

```powershell
$env:NODE_ENV = 'test'
$env:PATAFUNDI_TEST_DATABASE_URL = 'postgres://<user>:<password>@127.0.0.1:<port>/patafundi_test_local'
$env:DATABASE_URL = $env:PATAFUNDI_TEST_DATABASE_URL
node backend\scripts\migrate.js
npm.cmd test
```

Use a fresh disposable database for a full run; do not use the root development
database. The current verified suite passed 136/136 against a fresh loopback
PostgreSQL 16 database after applying all 48 migrations. One earlier attempt
placed the Node concurrency flag after file selectors; this left file workers
concurrent and caused 18 lock-wait statement timeouts. The root scripts now
put `--test-concurrency=1` before selectors.

## Synthetic data and migration 047+

Migrations 047 and 048 add provenance columns/triggers and defaults for
covered activity. Existing rows that do not match the explicit known-demo
identity backfill remain genuine (`is_demo=false`). Never expand a production
backfill based on guesses. Review the exact affected rows on a protected
staging snapshot, take verified backups, and use the controlled migration
process. Regression tests demonstrate genuine positive results alongside
demo exclusions, but do not cover every admin/staff/notification/report path.

## Backup and restore

The existing operational checklist is
[`database-backup.md`](./database-backup.md). Keep backups encrypted and
separate from the production account. Periodically restore to a new disposable
database and validate integrity before depending on the backup.

For a local PowerShell backup, use a secure environment variable for the URL
and a protected destination:

```powershell
pg_dump "$env:DATABASE_URL" --format=custom --file .\patafundi-backup.dump
```

Restore only into a newly created, verified disposable database. Do not add
`--clean` against an unknown or production target. A restore is destructive
to objects in its target database; confirm that target explicitly first.

