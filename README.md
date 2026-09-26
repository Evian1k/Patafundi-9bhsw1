# PataFundi

A production-grade on-demand home services marketplace connecting customers with verified individual fundis and professional service companies across Kenya. **One project. One codebase. One ecosystem.**

## Project Structure (one monorepo)

```
patafundi/
├── backend/                  Express API + PostgreSQL (PGlite embedded for dev)
│   ├── src/server.js         API entry — port 4000
│   ├── src/routes.js         All /api/* routes
│   ├── src/controllers/      Auth, jobs, payments, companies, staff, admin…
│   ├── src/services/         Money, matching, fraud, errors, notifications…
│   └── migrations/           33 SQL migrations (001–033)
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

## The five experiences (one app, role-aware)

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
| `npm test` | backend unit suite (82 tests) |
| `npm run test:e2e` | end-to-end API suite |
| `npm run typecheck` | TypeScript check for the frontend |
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
