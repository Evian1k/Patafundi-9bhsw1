# Docker Compose and Kubernetes

This deployment scaffolding targets the existing Express API (`backend/src/server.js`),
Vite website (`frontend/`), PostgreSQL, and local upload fallback. It does not
publish images or deploy to a cluster. No environment file, image registry
credential, PostgreSQL password, provider credential, or TLS certificate is
included in the repository.

## Local Docker Compose

Requirements: Docker Desktop with Compose v2+, Node.js 22+ for building mobile
apps outside Docker. Compose provides PostgreSQL 16, a one-shot migration
service, the API, and the website. PostgreSQL is private to the Compose network;
the website and direct API ports bind to loopback only. PostgreSQL and uploaded
files use named volumes. `docker compose down` preserves both; do not use
`docker compose down --volumes` unless you have confirmed the volumes contain
no needed data and deliberately intend to remove them.

From the repository root in PowerShell:

```powershell
if (-not (Test-Path deploy\compose\.env)) {
  Copy-Item deploy\compose\env.example deploy\compose\.env
}
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Generate separate random values and replace the placeholders in
`deploy/compose/.env`. `POSTGRES_PASSWORD` must be URL-safe because Compose
builds the application connection URL from it. These values are for local
development only; do not reuse them in staging or production. The example file
does not override the repository-root `.env`.

Validate and start:

```powershell
docker compose --env-file deploy/compose/.env config --quiet
docker compose --env-file deploy/compose/.env build
docker compose --env-file deploy/compose/.env up -d
docker compose --env-file deploy/compose/.env ps
Invoke-RestMethod http://127.0.0.1:4000/ready
Invoke-WebRequest http://127.0.0.1:8080/healthz
```

The migration container applies SQL files in lexical order under a PostgreSQL
advisory lock before the API starts. The API's managed-migration mode prevents
each application start from attempting schema changes. Demo seeding is off by
default; it is not needed to run the product. Do not enable it against a
production database.

Useful operations:

```powershell
docker compose --env-file deploy/compose/.env logs --tail 100 backend migrate
docker compose --env-file deploy/compose/.env exec postgres psql -U patafundi -d patafundi_dev
docker compose --env-file deploy/compose/.env stop
docker compose --env-file deploy/compose/.env start
docker compose --env-file deploy/compose/.env down
```

The separate `docker-compose.dev.yml` only starts PostgreSQL for running the
API/frontend directly on the host. It retains the existing `.\pgdata` bind
mount (which may contain data) and publishes PostgreSQL on `127.0.0.1` only.
Review that directory and use an explicit backup before changing its storage
configuration; the setup does not reset it.

## Kubernetes Kustomize

Requirements before any deployment:

- A Kubernetes cluster, a CNI that enforces `NetworkPolicy`, `kubectl`, and an
  ingress-nginx controller in the `ingress-nginx` namespace.
- A default `StorageClass` that can provision a 10 GiB `ReadWriteOnce` PVC.
- A separate, backed-up PostgreSQL database and secret manager. Never point a
  test/staging migration at production.
- A private image registry and immutable image tags/digests. Replace every
  `registry.example.invalid/...:replace-before-deploy` image reference before
  using staging or production overlays.
- TLS certificates and the `patafundi-tls` Secret, plus real site hostnames.

The overlays are renderable configuration, not a claim of cluster validation.
The API starts with production settings, no automatic migrations or demo seed,
non-root/read-only container filesystems, readiness/liveness probes, and one
replica. One replica is intentional: the API currently runs schedulers and a
queue worker in-process. Do not scale it until scheduled jobs, expiry, fraud
checks, and queue processing are moved to a separately coordinated worker or
otherwise made safe across replicas. Uploaded local files use a single-writer
PVC; production should use the configured object-storage integration and
confirm backup/restore behavior.

Render the manifests without connecting to a cluster:

```powershell
kubectl kustomize deploy\k8s\overlays\local
kubectl kustomize deploy\k8s\overlays\staging
kubectl kustomize deploy\k8s\overlays\production
kubectl kustomize deploy\k8s\migrations\overlays\local
kubectl kustomize deploy\k8s\migrations\overlays\staging
kubectl kustomize deploy\k8s\migrations\overlays\production
```

For local cluster use, build both images into the cluster's image store, apply
the namespace manifest and create the `patafundi-runtime` Secret out of band,
then run the
migration Job and wait for its success **before** applying the application
overlay. The Secret must contain `DATABASE_URL`, `JWT_SECRET`,
`REFRESH_TOKEN_SECRET`, and `ENCRYPTION_KEY`; use your cluster secret manager
for staging/production, not committed Secret YAML or command-line literal
values. For example, create a protected, untracked env file outside the repo
and pass it to `kubectl create secret generic patafundi-runtime
--from-env-file=<protected-file> -n <namespace>`. For each release, remove only the prior completed Job object (never the
database or PVC), apply the matching migration overlay, inspect logs and wait,
then deploy the matching application overlay:

```powershell
kubectl delete job patafundi-migrate -n patafundi-staging --ignore-not-found
kubectl apply -k deploy\k8s\migrations\overlays\staging
kubectl wait --for=condition=complete job/patafundi-migrate -n patafundi-staging --timeout=15m
kubectl logs job/patafundi-migrate -n patafundi-staging
kubectl apply -k deploy\k8s\overlays\staging
kubectl rollout status deployment/patafundi-api -n patafundi-staging
kubectl rollout status deployment/patafundi-web -n patafundi-staging
```

Before creating the secret on a new cluster, create the namespace first, for
example `kubectl apply -f deploy\k8s\overlays\staging\namespace.yaml`. The
migration overlay also renders a namespace manifest, but the secret must exist
before the Job can connect.

Before first apply, replace staging/production hosts and image names/tags in
the relevant `deploy/k8s/overlays/*` and migration overlays. The ingress policy
assumes the standard ingress-nginx namespace and pod label; verify those labels
for the target cluster. The policies restrict inbound access to the API/web,
but do not restrict outbound traffic. Cluster egress controls must permit DNS,
the selected PostgreSQL endpoint, and required HTTPS provider/storage endpoints.
NetworkPolicy behavior depends on the cluster CNI.

## What this does not verify

Compose configuration, image builds, and Kustomize rendering are static/local
checks. They do not establish a staging or production rollout, cloud
PostgreSQL connectivity, ingress/TLS behavior, storage durability, backup
restoration, provider callbacks, production secrets, autoscaling safety, or
mobile-device connectivity. Complete those checks against isolated staging
resources before any customer launch.
