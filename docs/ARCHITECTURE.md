# PataFundi architecture

This describes the current repository, not a proposed replacement design.
The current release verdict and evidence are maintained in
[`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) and the root
[`PATAFUNDI_READINESS_REPORT.md`](../PATAFUNDI_READINESS_REPORT.md).

## Components

| Component | Location | Responsibility |
|---|---|---|
| Backend API | `backend/src/server.js`, `backend/src/routes.js` | Express HTTP and Socket.IO API, authentication, role checks, controllers, workflows |
| Web application | `frontend/` | Vite/React single-page web product with customer, Fundi, company/technician, admin, and staff route experiences |
| Customer mobile | `apps/customer-mobile/` | Expo / React Native customer client for Android and iOS |
| Fundi mobile | `apps/fundi-mobile/` | Expo / React Native provider client for Android and iOS |
| Shared mobile code | `packages/shared/` | Shared API/authentication client, theme, and app components |
| Database | PostgreSQL 16; PGlite for isolated development/test fallback | Durable production data, relational constraints, background queue table |
| Database migrations | `backend/migrations/` | Lexically ordered schema changes; currently migrations 001-048 |
| Background processing | `backend/src/queueWorker.js` and timers in `server.js` | PostgreSQL `job_queue` processing and scheduled jobs; no Redis dependency |
| Object/file storage | `backend/src/services/storageService.js` | Private R2 integration when configured; local uploads are a development fallback |

The root package uses npm and the root `package-lock.json`. Each mobile
application has its own npm package and lockfile. The website is a separate
web product; the Expo apps target native Android/iOS, not web.

## Main request and data flows

1. Web and mobile clients call the Express API. The web production container
   uses nginx for same-origin `/api/` and `/socket.io/` proxying. Mobile
   clients select their API origin through Expo public build-time
   configuration; these values are public, not secrets.
2. Authentication issues application tokens/cookies. API middleware checks
   authentication, role permissions, company membership, and the applicable
   ownership/tenant boundary before controllers access records.
3. Controllers and services persist marketplace activity in PostgreSQL.
   Schema migrations provide foreign keys, check constraints, and
   `is_demo` provenance columns/triggers for covered entities.
4. Job quote and status transitions use backend workflows. Accepting a quote
   is distinct from completing a job. Payment state is determined server-side
   and is separate from client interaction.
5. Notifications are queued in PostgreSQL and handled by registered in-process
   queue handlers. Socket.IO broadcasts live events to scoped rooms.

## External integrations

The codebase contains integrations/configuration for M-Pesa Daraja and Stripe,
Resend email, Africa's Talking/Twilio SMS, Firebase Cloud Messaging, Cloudflare
R2, Google Maps and OpenStreetMap geocoding, AWS Rekognition, and a server-side
AI service. Implemented code does not prove that credentials, provider
accounts, callback registrations, approvals, delivery, or settlement are
working. Provider verification is a staging prerequisite.

## Deployment model

- Host development: root `npm run dev` starts the API on port 4000 and Vite on
  port 3000.
- Full Compose: PostgreSQL, one-shot migration, API, and nginx web container.
  Host API/web ports bind to loopback; PostgreSQL is internal to the Compose
  network.
- PostgreSQL-only Compose: `docker-compose.dev.yml` uses an existing local
  `.\pgdata` bind mount and publishes PostgreSQL on loopback.
- Kubernetes: local/staging/production Kustomize overlays exist for API/web
  and a one-shot migration Job. They are templates; no cluster deployment has
  been validated.
- Mobile apps run outside the web container and connect to the configured API.

## Trust boundaries and operational risks

- Clients, including mobile public configuration, are untrusted. Authorization
  and financial state changes must be enforced server-side.
- Provider callbacks must be authenticated and idempotent; no frontend success
  event proves a payment or payout.
- Test/demo provenance is enforced in covered database and service paths, but
  regression coverage does not cover every report, notification, history, or
  analytics query.
- Queue processing and timers currently run in the API process. Kubernetes
  replicas are intentionally one; scaling out could duplicate scheduled work
  unless coordination or process separation is implemented.
- Local file uploads use a single-writer volume. Production should use private
  object storage and verify backup, retention, and recovery.
- No Redis service is required by the current code. The queue table uses
  PostgreSQL locking (`FOR UPDATE SKIP LOCKED`).
- A production database snapshot, live provider credentials, signed mobile
  builds, and live staging journeys were not available for this verification.

