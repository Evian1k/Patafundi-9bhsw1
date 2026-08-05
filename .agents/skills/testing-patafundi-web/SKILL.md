---
name: testing-patafundi-web
description: How to run and test the PataFundi web app locally (staff dashboards, customer settings), including seeded logins and how to inject API failures.
---

# Testing the PataFundi web app locally

## Running it
- Root is Vite + React (`src/`) plus an Express backend (`backend/src`). `frontend/` is a stale duplicate — ignore it.
- `npm install` requires `--legacy-peer-deps` (react-native wants @types/react 19, web wants 18).
- No DATABASE_URL needed: `PATAFUNDI_EMBEDDED_DB=1 JWT_SECRET=devsecret node backend/src/server.js` auto-migrates and seeds an embedded PGlite DB (~40s first boot; watch for `[PataFundi API] listening`).
- `npm run db:migrate` / `db:seed` require a real `DATABASE_URL` and will fail with embedded mode — rely on the server's auto `ensureDevDatabase` instead.
- Frontend: `npx vite --port 8080`; it proxies `/api` and `/socket.io` to `127.0.0.1:4000`.

## Logins (seeded by ensure-dev-db.js)
- Staff portal `/staff/login`: admin@patafundi.com / `Admin@2024!` (super_admin), plus ops/support/fraud/finance/dispatch/devops/auditor@patafundi.com with `<Role>@2024!`.
- Customer `/auth`: demo@patafundi.com / `Demo@2024!`; fundi@patafundi.com / `Fundi@2024!`.
- When typing passwords with computer-use, type the password into the field as its own action and click the submit button; typing a trailing `\n` in the same `type` action can submit before the final `!` registers.

## Staff dashboard routes
`/staff/admin` (Overview), `/staff/dispatch/dashboard`, `/staff/finance/dashboard`, `/staff/growth`, `/staff/support/dashboard`, `/staff/devops/dashboard`, `/staff/executive`.

## Injecting API failures (important)
Do NOT just kill the backend to test dashboard error states: `StaffLayout` calls `/api/staff/me/permissions` on every staff page and redirects to `/staff/login` when it fails, so you never see the dashboard.
Instead run the backend on 4001 and put a tiny Node reverse proxy on 4000 (the port Vite proxies to) that returns 5xx only for the endpoints under test (e.g. `/api/admin/dashboard`, `/api/staff/*`, non-GET `/api/users/settings`), gated by a flag file so you can toggle failure on/off at runtime and then exercise Retry.
Start such helper processes with `setsid nohup ... &` — a later `pkill -f <name>` from the same shell can otherwise kill your own restart.

## Known trap
Customer Settings safety/privacy toggles write camelCase keys (`hideProfile`) but `Settings.tsx` reads snake_case (`hide_profile`), so toggles may not persist across reload even when the PUT returns 200. Verify persistence with `GET /api/users/settings` before blaming a UI change.

## Devin secrets needed
None — everything runs locally with the embedded DB and seeded demo accounts.
