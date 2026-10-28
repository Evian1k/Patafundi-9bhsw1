# Production readiness

## Verdict: NOT READY

Evidence and the detailed subsystem classification are in
[`PATAFUNDI_READINESS_REPORT.md`](../PATAFUNDI_READINESS_REPORT.md). This page
is a durable summary; successful source builds or local regression tests do
not certify a real customer launch.

## Verified

- Fresh disposable PostgreSQL 16: all 48 migrations applied; full selected
  backend suite passed 136/136 with serial execution.
- PostgreSQL financial/demo regression suite passed 7/7.
- Separate PGlite E2E passed 4/4.
- Root lint passed with 0 errors and 34 warnings.
- Website typecheck was rerun and passed; prior website production build and
  customer/Fundi typechecks and Android/iOS JavaScript exports passed, but
  those mobile/build checks were not all repeated during this continuation.
- The frontend Docker image built successfully once. Subsequent Compose/
  backend rebuilds were blocked by Docker Hub OAuth `HTTP/2 GOAWAY` and npm
  registry `EIDLETIMEOUT` errors; no Compose runtime was started.
- Compose config and all six Kubernetes Kustomize overlays render.

## Blockers and unverified areas

- Fresh root npm audit reports 11 advisories (5 moderate, 6 high). Customer
  mobile reports 43 (20 moderate, 23 high); Fundi mobile reports 38
  (15 moderate, 23 high). Mobile audits exit 1 and require compatibility-
  safe remediation.
- Hosted GitHub Actions was not run. Its high-severity audit steps will fail
  against current root/mobile advisories until those findings are remediated.
- No Compose stack startup/health/persistence test has been completed.
- No Kubernetes context or local cluster exists; deployment was not run.
- The complete customer/Fundi/company/admin/staff journeys were not verified
  in a live staging app.
- M-Pesa/Stripe test or production callbacks, refunds, settlements, payouts,
  email/SMS/push, OCR, object storage, and map-provider delivery require valid
  sandbox or external configuration and remain unverified.
- No native Android/iOS build, physical device/simulator launch, signed
  artifact, store publication, production database, or production deployment
  was tested.
- K8s API replicas must remain one until in-process timers/queue workers are
  separated or coordinated across replicas.

## Next release gates

1. Resolve high dependency advisories safely, update tracked lockfiles, and
   pass fresh audits.
2. Start and health-check the local Compose stack; test only its disposable
   named volumes and preserve them unless deletion is explicitly authorized.
3. Validate all high-risk workflows with isolated staging data and legitimate
   provider sandbox credentials.
4. Review synthetic provenance migration effects on a staging snapshot and
   rehearse backups/restore.
5. Produce signed native builds and verify login, API selection, permissions,
   notifications, job/quote flows, and error paths on supported devices.
6. Complete security, privacy/legal, monitoring, backup, incident response,
   DNS/TLS, production-secret, rollback, and rollout review.

No production deployment, publishing, commit, or push was performed.
