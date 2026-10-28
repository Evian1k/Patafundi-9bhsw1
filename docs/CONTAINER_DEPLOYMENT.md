# Container deployment

This runbook uses the repository's Dockerfiles and Compose configuration. It
does not publish images or deploy to a remote environment. The current build
and startup evidence is in [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).

## Prerequisites

- Windows 10/11 with Docker Desktop installed and its Linux container engine
  running.
- PowerShell from the repository root.
- Enough disk space for PostgreSQL and Docker images.
- Node.js is needed for host/mobile development; Compose builds the API and
  website in Linux containers.

Check the daemon and Compose:

```powershell
docker version
docker compose version
```

If `docker version` reports a client but no server, Docker Desktop's Linux
engine is not available. Start Docker Desktop and wait until it reports
running; do not enable Windows features or restart Windows without the
operator's approval.

## Full local stack

The Compose stack contains PostgreSQL 16, a one-shot migration container,
the Express API, and the web app served through unprivileged nginx. The web
port is `127.0.0.1:8080`; direct API access is `127.0.0.1:4000`. PostgreSQL
has no host port in this Compose file. Named volumes preserve database and
upload data.

Create a local-only configuration if absent, then replace its placeholders
with unique random values. Never overwrite an existing env file:

```powershell
if (-not (Test-Path deploy\compose\.env)) {
  Copy-Item deploy\compose\env.example deploy\compose\.env
}
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Build, start, and check:

```powershell
docker compose --env-file deploy\compose\.env config --quiet
docker compose --env-file deploy\compose\.env build
docker compose --env-file deploy\compose\.env up -d
docker compose --env-file deploy\compose\.env ps
Invoke-RestMethod http://127.0.0.1:4000/ready
Invoke-WebRequest http://127.0.0.1:8080/healthz
```

Inspect output and stop without deleting persistent volumes:

```powershell
docker compose --env-file deploy\compose\.env logs --tail 100 backend migrate
docker compose --env-file deploy\compose\.env stop
docker compose --env-file deploy\compose\.env down
```

Do not run `docker compose down --volumes` or remove named volumes without
checking what data they contain and explicit approval. The API has in-process
timers and a queue worker, so do not scale API replicas above one.

## PostgreSQL-only host development

`docker-compose.dev.yml` publishes PostgreSQL to loopback port 5432 and binds
`.\pgdata`. Inspect and back up that directory before use; it may contain
existing user data. This configuration is separate from the full Compose
stack and must not be used as a production reset mechanism.

```powershell
docker compose -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.dev.yml ps
```

Configure `DATABASE_URL` only for the intended local database, apply
migrations with `node backend\scripts\migrate.js`, and start the host apps with
`npm.cmd run dev`.

## Verified status and limitations

The Compose configuration renders and the backend and migration images built.
The frontend production image also built successfully after retrying a
transient package-download reset; its build still reports a 910.93 kB main
JavaScript chunk and npm audit findings. The Compose stack has **not** been
started or health/persistence-tested, so API health, database connectivity,
nginx-to-API routing, restart, and shutdown through Compose remain unverified.

No credentials are built into the images. Compose passes secrets from the
local env file at runtime. `NODE_ENV` for the local API is development to
support localhost cookie behavior; automatic demo seeding is explicitly
disabled. A successful image build is not a running/healthy application.

