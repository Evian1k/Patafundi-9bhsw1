---
name: testing-patafundi
description: How to run and end-to-end test the PataFundi web app locally (dev servers, demo logins, staff console, API role checks, production-mode checks).
---

# Testing PataFundi locally

## Running the app
- `npm run dev` from the repo root starts both services: Express backend on **:4000** and Vite frontend on **:8080** (Vite proxies `/api` to the backend). First start takes ~45–60s because it runs ~30 migrations and seeds.
- No `DATABASE_URL` is needed in dev: the backend falls back to an embedded PGlite DB in `.pgdata/` and auto-generates JWT secrets. Override the data dir with `PATAFUNDI_PGDATA_DIR`.
- `npm ci` needs `--legacy-peer-deps` (pre-existing `@types/react` 18 vs 19 conflict with the `apps/*` Expo workspaces).
- Readiness signal in the log: `[PataFundi API] listening on 0.0.0.0:4000 (development)`. Seeding is confirmed by ten `[seed] <email> (<role>)` lines.

## Logins
Ten demo accounts are seeded in dev (see `backend/scripts/ensure-dev-db.js`). Most useful:
- Customer: `demo@patafundi.com` / `Demo@2024!` → lands on `/dashboard`
- Super admin: `admin@patafundi.com` / `Admin@2024!` → lands on `/staff` (Staff Console)
- Fundi: `fundi@patafundi.com` / `Fundi@2024!`

Customer login page is `/auth`; staff can also use `/staff/login`. If you are already authenticated, visiting `/auth` auto-redirects you to your role's dashboard — sign out first (sidebar "Sign out" on `/staff`, or the exit icon in the customer dashboard header) before switching accounts.

## Verifying role-gated API routes without curl-with-stolen-cookies
Because the frontend and API share the origin `localhost:8080` (Vite proxy) and auth is cookie-based, you can simply **navigate the browser to `http://localhost:8080/api/...`** while logged in. The JSON response renders in the tab, using the real session. This is a clean, recordable way to show e.g. `GET /api/staff/escalations` returning `200` for a staff role and `403 {"success":false,"message":"Staff access required"}` for a customer. Staff roles are listed in `STAFF_ROLES` in `backend/src/middleware/rbac.js`.

For scripted API checks, log in with `curl -c jar.txt -X POST http://127.0.0.1:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":...,"password":...}'`. Non-GET requests need the `x-csrf-token` header set to the `csrf_token` cookie value (`backend/src/middleware/auth.js`).

## Golden path: creating a job as a customer
Dashboard → "New Job" → pick a category → type ≥10 chars of description → pick urgency, then type an address (e.g. "Kenyatta Avenue, Nairobi") and **click a suggestion from the autocomplete list** (Continue stays disabled until a location is actually selected) → Review → "Submit Job Request". You land on `/job/<id>/tracking` and the job shows under ACTIVE JOBS on the dashboard. Navigating away from the wizard triggers a native "Leave site?" dialog — accept it with the "Leave" button.

## Testing production-only behaviour
- Scripts: `NODE_ENV=production node backend/scripts/seed.js` is safe — it returns before opening any DB.
- Server: starting with `NODE_ENV=production` **without** `DATABASE_URL` boots but every DB call fails (`DATABASE_URL is not configured`) and the DB/seed bootstrap never runs, so production seeding behaviour cannot be observed that way. A throwaway Postgres `DATABASE_URL` is required for that.
- CORS is still testable in production mode without a DB: start a second server on a spare port with `NODE_ENV=production PORT=4100 JWT_SECRET=... REFRESH_TOKEN_SECRET=... FRONTEND_ORIGIN=https://app.example.com` and compare `OPTIONS` preflights. Loopback origins should be rejected (`Not allowed by CORS: http://localhost:8080`) while `FRONTEND_ORIGIN` gets `204`. Always use a separate `PORT` and `PATAFUNDI_PGDATA_DIR` so you don't disturb the dev DB.

## Devin Secrets Needed
None for local testing. A throwaway Postgres `DATABASE_URL` would be needed to test production-mode DB/seeding behaviour.
