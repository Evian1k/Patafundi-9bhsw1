# PataFundi

A Kenya-first on-demand home services marketplace connecting customers with individual fundis and professional service companies. **One monorepo. Shared platform core. Separate web and native mobile experiences.**

## Project Structure (one monorepo)

```
patafundi/
├── backend/                  Express API + PostgreSQL (PGlite embedded for dev)
│   ├── src/server.js         API entry — port 4000
│   ├── src/routes.js         All /api/* routes
│   ├── src/controllers/      Auth, jobs, payments, companies, staff, admin…
│   ├── src/services/         Money, matching, fraud, errors, notifications…
│   └── migrations/           46 SQL migration files
├── frontend/                 React 18 + Vite + shadcn/ui + Tailwind — THE web app
│   └── src/
│       ├── pages/            Customer, Fundi, Company portal, Technician, Staff
│       ├── routes/           Single role-aware router (guards by role)
│       ├── components/       UI kit + shared design system
│       └── lib/api.ts        Single API client for every role
├── apps/customer-mobile/     Expo (React Native) customer app
├── apps/fundi-mobile/        Expo (React Native) fundi app
├── packages/shared/          @patafundi/shared — API client, auth store, theme shared by both mobile apps
├── docs/                     Runbooks + archived historical audits (docs/archive/)
├── scripts/                  Brand/logo tooling
└── package.json              One entry point: npm run dev (backend + frontend)
```

> Duplicate/superseded frontends and static previews were consolidated into
> `frontend/`. The Expo mobile apps live in `apps/` and share code through
> `packages/shared`. Historical audit trail: `docs/archive/`.

## Useful additions in this takeover

- **Notification center** (staff console, customer dashboard, fundi hub) — per-user scoped, role-private (spec §11)
- **Quote approval** — customers approve/reject provider quotes inside job tracking (status `offered`)
- **Payment receipt** — amount, M-Pesa code and timestamp after confirmation
- **Completion code re-issue** — customers can re-issue their confirmation code ("Resend"), the fundi can never see it
- **Fundi self-service** — Edit Profile (bio/skills) and My Reviews pages
- **Technician app** — GPS-validated check-ins and work-evidence photo upload
- **Job expiry** — unanswered offers return to matching after 5 min; unmatched requests expire after 24 h
- **Docker stack** — `docker compose up -d --build` brings up Postgres + API + web (nginx same-origin proxy)

## Mobile apps (Expo)

```bash
cd apps/customer-mobile && npm install && npm start   # port 8081
cd apps/fundi-mobile     && npm install && npm start   # port 8082
```

Both apps read their backend host from `EXPO_PUBLIC_HOST` (no hardcoded
localhost — set it to your LAN IP for devices, or the Render URL for
production) and share one codebase via `@patafundi/shared`. The customer app
rejects fundi accounts and vice-versa (wrong-app guard).

## Run it

```bash
npm install
npm run db:push      # migrate + seed demo ecosystem (12 accounts, Apex company)
npm run dev          # backend :4000 + frontend :3000 concurrently
```

Demo login for every role (password `PataFundi#2026`):
`customer.demo@` `fundi.demo@` `company.demo@` `dispatcher.demo@` `technician.demo@` `operations.demo@` `support.demo@` `finance.demo@` `fraud.demo@` `devops.demo@` `auditor.demo@` `admin.demo@patafundi.test` — full list in [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md).

## Product experiences on the shared platform

| Experience | Entry | Highlights |
|---|---|---|
| **Customer** | `/auth` → customer home | discovery → booking → live tracking → chat → OTP confirm → receipt → review → rebook |
| **Fundi (individual)** | `/fundi` | job feed, availability, earnings, portfolio, verification levels |
| **Company** | `/company` | Partner application → portal: dashboard, dispatch, team, schedule, quality, finance |
| **Technician** | `/technician` | sees only assigned work, check-in/out, completion evidence |
| **Staff / Super Admin** | `/staff/login` | role dashboards, error triage, fraud, finance, audit, AI command center |

## Error handling policy

Users never see raw technical errors. Every failure returns a friendly message
plus a reference code (`ERR-XXXXXX`); the full detail is logged server-side and
routed to the responsible staff role (DevOps / Finance / Fraud), with a
10-minute dedupe window. Frontend crashes self-report to `/api/client-errors`.
Staff triage everything in **Staff Portal → DevOps → Error Logs**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | backend (:4000) + frontend (:3000) together |
| `npm test` | sequential backend suite against a disposable PGlite database |
| `npm run test:e2e` | end-to-end API suite |
| `npm run typecheck` | TypeScript check for the frontend |
| `cd apps/customer-mobile && npm run typecheck` | Customer Expo app TypeScript check |
| `cd apps/fundi-mobile && npm run typecheck` | Fundi Expo app TypeScript check |
| `npm run build` | production frontend bundle |
| `npm run db:push` | migrate + seed demo data (run BEFORE `dev`, server stopped) |

## Documentation

- [PATAFUNDI_COMPLETE_SYSTEM_SPEC.md](PATAFUNDI_COMPLETE_SYSTEM_SPEC.md) — full system specification
- [PATAFUNDI_COMPANY_ECOSYSTEM.md](PATAFUNDI_COMPANY_ECOSYSTEM.md) — company lifecycle & isolation model
- [PATAFUNDI_FEATURE_MATRIX.md](PATAFUNDI_FEATURE_MATRIX.md) — what exists, per role
- [PATAFUNDI_SCREEN_ROUTE_MATRIX.md](PATAFUNDI_SCREEN_ROUTE_MATRIX.md) — every screen and route
- [PATAFUNDI_E2E_TEST_REPORT.md](PATAFUNDI_E2E_TEST_REPORT.md) — latest test results
- [PATAFUNDI_ROLE_SECURITY_AUDIT.md](PATAFUNDI_ROLE_SECURITY_AUDIT.md) — RBAC & isolation audit
- [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md) — demo ecosystem credentials
