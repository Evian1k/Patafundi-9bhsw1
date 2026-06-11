# PataFundi Investigation Report — Fraud Dashboard 404 & Fundi 403

**Date:** 2026-06-10  
**Production API:** `https://patafundi-9bhsw1.onrender.com/api`  
**Git HEAD (local & origin/main):** `a7b3d7f`

---

## 1. Fraud Dashboard Route Audit

| Route | Exists Locally | Exists on Production | Controller Attached | Fix Required |
|---|---|---|---|---|
| `GET /api/admin/fraud/dashboard` | **Yes** | **No (404)** | `fraud.fraudDashboard` | **Redeploy Render** to commit `a7b3d7f+` |
| `GET /api/admin/fraud/alerts` | **Yes** | **No (404)** | `fraud.listFraudAlerts` | **Redeploy Render** |
| `GET /api/admin/fraud/debts` | **Yes** | **No (404)** | `fraud.listCommissionDebts` | **Redeploy Render** |
| `GET /api/admin/fraud/suspicious-jobs` | **Yes** | **No (404)** | `fraud.listSuspiciousJobs` | **Redeploy Render** |

### Verification performed

1. **`backend/src/routes.js`** — Lines 123–131 register all four fraud admin routes with `authRequired`, `requireRole('admin')`, and `fraudController` handlers.
2. **`backend/src/controllers/fraudController.js`** — Exports: `fraudDashboard`, `listFraudAlerts`, `listCommissionDebts`, `listSuspiciousJobs`, `listSuspiciousUsers`, `fraudReports`, `getUserFraudProfile`, `getJobTimelineAdmin`, `adminFraudAction`.
3. **`backend/src/server.js`** — Mounts `app.use('/api', router)` — routes are wired correctly.
4. **GitHub `origin/main`** — `git show origin/main:backend/src/routes.js` contains fraud routes (same as local).
5. **Production probe** — `GET /api/admin/fraud/dashboard` → **404**. `GET /api/health` → **200** but response lacks `build` field (pre-deploy version).
6. **Migrations** — `006_fraud_detection_system.sql` creates `fraud_alerts`, `user_fraud_scores`, etc. Production likely missing migration 006 (dashboard would 503/500 if routes existed without tables).

### Root cause (Fraud 404)

**Render is running an older build** that predates the fraud route registration, despite `origin/main` containing the routes at `a7b3d7f`. This is a **deployment drift** issue, not missing code.

**Actions:**
1. Trigger manual deploy on Render from `main` branch.
2. Run migrations 006 (and 007/008 if not applied): `npm run db:migrate` on production DB.
3. After deploy, confirm `GET /api/health` returns `"build": "<commit-sha>"`.
4. Set `ACCESS_DEBUG=true` on Render temporarily to trace admin requests.

---

## 2. Fundi 403 Root-Cause Analysis

### Request lifecycle (example: `POST /api/fundi/location`)

```
Frontend GPS tick
  → apiClient.goOnlineLocation() [Bearer token from localStorage]
  → Express /api/fundi/location
  → authRequired (loads user from DB by JWT sub)
  → requireApprovedFundi (NEW — replaces requireRole('fundi'))
  → fundiController.location → requireApprovedFundi internal check
  → 200 or 403
```

### Failing endpoints — root causes

| Endpoint | Middleware chain | 403 reason | DB role | Approval status | Fix |
|---|---|---|---|---|---|
| `GET /jobs/fundi/active` | `authRequired` → `requireApprovedFundi` | Role ≠ `fundi` OR `approval_status` ≠ `approved` | Often `fundi_pending` | `pending` | Expected until admin approves; after approval ensure role=`fundi` |
| `POST /fundi/location` | `authRequired` → `requireApprovedFundi` → controller check | Same | Same | Same | Same |
| `POST /jobs/:id/accept` | `authRequired` → `requireApprovedFundi` → `acceptJob` approval check | Same | Same | Same | Same |
| `POST /fundi/register` (old flow) | `authRequired` required login first | No token | N/A | N/A | **Fixed:** `POST /auth/register/fundi` is now public |

### Primary root causes identified

1. **`requireRole('fundi', 'admin')` excluded `fundi_pending`** — Pending applicants correctly blocked from operational endpoints, but error message was generic `403` with no context.
2. **Fundi registration required prior login** — `FundiRegister.tsx` checked `localStorage auth_token` and redirected to `/auth?mode=signup`.
3. **Stale frontend session role** — `sessionStorage auth_role` was not refreshed after admin approval; `resolveAuthRole` preferred stale lock over live API role. **Fixed** in `authSession.ts`.
4. **JWT vs DB** — `authRequired` uses **database role**, not JWT payload role. Stale JWT is not the backend issue; stale sessionStorage was the frontend issue.

### Debug logging added

Set `ACCESS_DEBUG=true` on the server to emit structured logs from:
- `authRequired`
- `requireRole`
- `requireApprovedFundi` / `requireFundiAccount`
- `jobs.acceptJob`, `jobs.activeFundiJob`

Log fields: `userId`, `dbRole`, `jwtRole`, `fundiApprovalStatus`, `path`, `label`.

---

## 3. Fundi Registration — Implemented Flow

### New public endpoint

`POST /api/auth/register/fundi` (multipart, **no auth**)

Creates:
- `users.role = 'fundi_pending'`
- `users.status = 'active'`
- `fundis.approval_status = 'pending'`
- Verification documents → R2 via `uploadPrivateFile`
- OTP email → verify via `POST /auth/otp-verify`

### Frontend routes

| Route | Purpose |
|---|---|
| `/register/customer` | Customer signup (Auth page, signup mode) |
| `/register/fundi` | Full fundi onboarding (no login required) |
| `/fundi/pending` | "Your account is under review" after OTP |

### After admin approval

`adminController.approveFundi`:
- `users.role = 'fundi'`
- `fundis.approval_status = 'approved'`
- Selfie copied to profile photo (R2)

Only then: go online, accept jobs, location updates, payouts.

---

## 4. Deployment Checklist

- [ ] Push latest commits to GitHub `main`
- [ ] Render: Manual Deploy → latest commit
- [ ] Run migration 006 on production PostgreSQL
- [ ] Verify `GET /api/admin/fraud/dashboard` returns 401/403 (not 404) when unauthenticated
- [ ] Verify `GET /api/health` includes `"build": "<sha>"`
- [ ] Test fundi registration end-to-end on production without signing in first
