# PataFundi

A production-grade on-demand home services marketplace connecting customers with verified fundis (service professionals) across Kenya. Built with React, Express, PostgreSQL, Socket.IO, Cloudflare R2, and M-Pesa Daraja.

## Overview

PataFundi is a two-sided marketplace where customers can hire vetted fundis for plumbing, electrical, cleaning, carpentry, and more. The platform includes escrow payments, real-time GPS tracking, fraud detection, enterprise RBAC with 8 staff roles, and an AI advisory system.

### Customer Workflow
1. Register with email + OTP verification
2. Create a job (select service, location, description, budget)
3. Nearby approved fundis are matched automatically
4. Fundi accepts → customer tracks live GPS on map
5. Fundi completes job → customer receives completion OTP
6. Customer confirms completion with OTP
7. Escrow releases to fundi → customer leaves a review

### Fundi Workflow
1. Register publicly (no login required) — upload ID front, ID back, selfie
2. OTP email verification
3. Identity verification (face match, blur score, duplicate detection)
4. Admin reviews and approves
5. Fundi goes online → receives job requests
6. Accepts job → navigates to customer → checks in → completes
7. Earns money in escrow → requests payout to M-Pesa

### Staff Workflow
8 staff roles with granular permissions (32 permissions across 8 categories):
- **Super Admin** — full platform control, AI Command Center, commission control, staff management
- **Admin (Ops)** — fundi approvals, job management, dispute escalation
- **Support Agent** — tickets, disputes, user queries (no finance access)
- **Fraud Analyst** — fraud dashboard, flag/suspend, risk analysis
- **Finance Team** — payments, escrow, payouts, revenue reports
- **Dispatch Team** — live operations map, job assignment
- **DevOps Engineer** — system health, logs, metrics
- **Auditor** — read-only compliance view of all data

Staff login at `/staff/login` — customer/fundi accounts are rejected.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 7 + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion |
| Backend | Express 5 + Node.js 24 + Socket.IO |
| Database | PostgreSQL 16 (Neon/Render) / PGlite (dev fallback) |
| Storage | Cloudflare R2 (private, signed URLs) / local fallback (dev) |
| Payments | M-Pesa Daraja (STK Push C2B) |
| Email | Resend |
| Maps | Google Maps (optional) / OpenStreetMap + Leaflet (default) |
| Auth | JWT (15min access) + refresh tokens (30d, rotated) + CSRF + OTP |
| Deploy | Render (API) + Vercel (frontend) |

## Quick Start

### Prerequisites
- Node.js 20+ (24 recommended)
- PostgreSQL 16+ (or use Neon free tier — see below)

### Setup

```bash
git clone https://github.com/Evian1k/Patafundi-9bhsw1.git
cd Patafundi-9bhsw1
npm install
```

### Database Setup

**Option A — Free cloud Postgres (recommended, 30 seconds):**
1. Go to https://neon.tech → sign up with GitHub (free, no credit card)
2. Create a project → copy the connection string
3. Create `.env` with:
```env
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
JWT_SECRET=any-random-string-at-least-32-characters
REFRESH_TOKEN_SECRET=another-random-string-at-least-32-characters
COOKIE_SECURE=false
FRONTEND_ORIGIN=http://127.0.0.1:8080
CORS_ORIGINS=http://127.0.0.1:8080,http://localhost:8080,http://localhost:8081
```

**Option B — Docker Postgres:**
```bash
docker compose up -d
# Use DATABASE_URL=postgres://postgres:postgres@localhost:5432/patafundi
```

**Option C — PGlite (embedded, dev only):**
Leave `DATABASE_URL` empty. The server auto-generates JWT secrets and uses PGlite. May not work on Windows — use Option A or B.

### Run

```bash
npm run dev
```

This starts both backend (port 4000) and frontend (port 8080) concurrently. Open http://localhost:8080.

### Demo Accounts

Visit http://localhost:8080/demo (dev mode only — not accessible in production builds).

| Role | Email | Password |
|---|---|---|
| Customer | demo@patafundi.com | Demo@2024! |
| Fundi (approved) | fundi@patafundi.com | Fundi@2024! |
| Super Admin | admin@patafundi.com | Admin@2024! |
| Ops Manager | ops@patafundi.com | Ops@2024! |
| Support Agent | support@patafundi.com | Support@2024! |
| Fraud Analyst | fraud@patafundi.com | Fraud@2024! |
| Finance Team | finance@patafundi.com | Finance@2024! |
| Dispatch Team | dispatch@patafundi.com | Dispatch@2024! |
| DevOps Engineer | devops@patafundi.com | Devops@2024! |
| Auditor | auditor@patafundi.com | Auditor@2024! |

Staff login portal: http://localhost:8080/staff/login

## Feature Inventory

### Customer Features

| Feature | Status | Files |
|---|---|---|
| Registration + OTP | ✅ Working | `authController.js`, `Auth.tsx` |
| Login + JWT | ✅ Working | `authController.js`, `auth.js` |
| Password reset (OTP) | ✅ Working | `authController.js` |
| Profile + settings | ✅ Working | `userController.js`, `Settings.tsx` |
| Saved places | ✅ Working | `userController.js`, `saved_places` table |
| Job creation | ✅ Working | `jobController.js`, `CreateJob.tsx` |
| Scheduled jobs | ✅ Working | `jobs.scheduled_at` (migration 011) |
| Job photo upload | ✅ Working | `jobController.js`, `storageService.js` |
| Live fundi tracking | ✅ Working | `LiveTrackingMap.tsx`, `realtime.js` |
| M-Pesa payment (STK Push) | ✅ Working | `paymentController.js`, `mpesaService.js` |
| Escrow | ✅ Working | `payments.escrow_status`, `escrow_transactions` |
| Reviews | ✅ Working | `jobController.js`, `reviews` table |
| In-app chat | ✅ Working | `chatController.js`, `InAppChat.tsx` |
| Notifications (in-app) | ✅ Working | `notifications` table, `userController.js` |
| Fundi search | ✅ Working | `fundiController.js` |
| Dispute filing | ✅ Working | `disputeController.js` |
| Push notifications | ❌ Missing | No FCM/APNS |
| SMS notifications | ❌ Missing | No Twilio/Africa's Talking |
| Referral program | ⚠️ Partial | `referrals` table + API, no UI entry point |
| Loyalty tiers | ⚠️ Partial | `user_loyalty` table + API, no UI |
| Favourite fundis | ❌ Missing | No table |
| Tax invoices (PDF) | ❌ Missing | No PDF generation |
| Card payments | ❌ Missing | Stripe deps installed but unused |
| Social login | ❌ Missing | Email/password only |

### Fundi Features

| Feature | Status | Files |
|---|---|---|
| Public registration | ✅ Working | `fundiRegistrationService.js`, `FundiRegister.tsx` |
| ID + selfie upload | ✅ Working | `verification_documents`, `storageService.js` |
| Identity verification (face match) | ⚠️ Partial | `identityVerificationService.js` — perceptual hash default, Rekognition optional |
| Liveness verification | ⚠️ Partial | `livenessVerificationService.js` — rule-based, not real biometrics |
| Admin approval flow | ✅ Working | `adminController.approveFundi`, `fundiAccess.js` |
| Dashboard | ✅ Working | `FundiDashboard.tsx`, `fundiController.dashboard` |
| Go online/offline | ✅ Working | `fundiController.goOnline/goOffline` |
| GPS location streaming | ✅ Working | `fundiController.location`, `realtime.js` |
| Job acceptance | ✅ Working | `jobController.acceptJob` |
| Job completion OTP | ✅ Working | `jobController.completeJob` — OTP delivered via notification + socket |
| Wallet + transactions | ✅ Working | `paymentController.walletBalance` |
| Payout request | ⚠️ Partial | `payoutController.requestPayout` — no B2C automation |
| Ratings + reviews | ✅ Working | `fundiController.ratings` |
| Quality score (0-100) | ✅ Working | `enterpriseService.calculateQualityScore` |
| Quality tiers (Bronze→Elite) | ✅ Working | `fundi_quality_scores.tier` |
| Subscription (premium) | ✅ Working | `subscriptions` table + STK push payment |
| Earnings analytics | ❌ Missing | No UI |
| Availability calendar | ❌ Missing | Only on/off toggle |
| Portfolio gallery | ❌ Missing | No table |
| Tax documents (P9) | ❌ Missing | No PDF generation |
| SOS emergency button | ❌ Missing | No implementation |

### Staff Features

| Role | Dashboard | Key APIs | Restrictions |
|---|---|---|---|
| Super Admin | `/staff/executive` + `/staff/ai` + `/staff/commission` + `/staff/staff-mgmt` | All `/admin/*`, `/ai/*`, `/staff/*` | None — full access |
| Admin (Ops) | `/staff/operations` | `/staff/jobs`, `/staff/fundis`, `/admin/fundis/:id/approve` | No AI, no commission control, no role management |
| Support Agent | `/staff/support` | `/staff/disputes`, support tickets | No payments, no AI, no roles |
| Fraud Analyst | `/staff/fraud` | `/staff/fraud/*`, fundi suspend | No payments, no roles |
| Finance Team | `/staff/finance` | `/staff/payments`, `/staff/revenue`, escrow release | No disputes, no AI, no roles |
| Dispatch Team | `/staff/dispatch` | `/staff/jobs`, live operations | No payments, no AI |
| DevOps Engineer | `/staff/devops` | `/staff/audit-logs`, system health | No payments, no customer data |
| Auditor | `/staff/audit` | `/staff/audit-logs` (read-only) | No edit/approve/create — view only |

### AI Features

| Capability | Status | Notes |
|---|---|---|
| Fundi verification analysis | ✅ Working | Face match + fraud risk → recommend approve/reject |
| Fraud pattern detection | ✅ Working | High-risk users, repeat offenders, suspicious payments |
| Revenue analysis | ✅ Working | Drop detection, category performance |
| Commission rate analysis | ✅ Working | Collection gap analysis per category |
| Platform health monitoring | ✅ Working | Backlog, disputes, critical alerts |
| AI audit log (immutable) | ✅ Working | `ai_recommendations` table with delete trigger |
| AI can approve fundis | ❌ Never | AI only recommends — super_admin approves |
| AI can suspend users | ❌ Never | AI only flags — super_admin suspends |
| AI can modify payments | ❌ Never | AI only analyzes — no write access to payments |
| Real LLM integration | ❌ Missing | `@google/generative-ai` installed but unused — current AI is rule-based |

## Security

| Control | Status | Implementation |
|---|---|---|
| JWT auth (15min access + 30d refresh) | ✅ Implemented | `middleware/auth.js` |
| Refresh token rotation | ✅ Implemented | `authController.refresh` |
| CSRF protection (double-submit cookie) | ✅ Implemented | `middleware/auth.js` |
| Cookie security (httpOnly + sameSite + secure) | ✅ Implemented | `setAuthCookies` |
| OTP with brute-force lockout (5 attempts) | ✅ Implemented | `fraudService.verifyOtpWithLockout` |
| Email verification required | ✅ Implemented | `authController.login` |
| bcrypt password hashing (cost 12) | ✅ Implemented | `authController.register` |
| Strong password (8+ chars, letters + digits) | ✅ Implemented | Server + client zod |
| RBAC (8 roles, 32 permissions, user overrides) | ✅ Implemented | `middleware/rbac.js`, migration 009 |
| super_admin protection (cannot be API-assigned) | ✅ Implemented | `rbacController.setUserRole` |
| Rate limiting (5 tiers) | ✅ Implemented | `middleware/rateLimit.js` |
| File upload validation (MIME, size, executable rejection) | ✅ Implemented | `middleware/upload.js` |
| R2 private bucket + signed URLs (15-min TTL) | ✅ Implemented | `storageService.js` |
| Document access audit logging | ✅ Implemented | `middleware/storageAccess.js` |
| M-Pesa webhook signature verification | ✅ Implemented | `mpesaService.verifyWebhookSignature` |
| Webhook replay protection | ✅ Implemented | `processed_webhook_callbacks` |
| SQL injection (parameterized queries) | ✅ Implemented | All `query()` calls |
| Audit log immutability (6 triggers) | ✅ Implemented | migrations 006, 009, 010, 012 |
| WebSocket JWT auth + room-scoped access | ✅ Implemented | `realtime.js` |
| CORS allowlist (no wildcard) | ✅ Implemented | `cors.js` |
| Helmet security headers | ✅ Implemented | `server.js` |
| Trust proxy (Render LB) | ✅ Implemented | `server.js` |
| 2FA / TOTP | ❌ Missing | Email OTP only |
| Push notifications | ❌ Missing | In-app + email only |
| SMS OTP | ❌ Missing | Email only |
| CSP header | ❌ Missing | Helmet defaults only |
| PII encryption at rest | ❌ Missing | Plaintext in Postgres |
| Account lockout (password) | ❌ Missing | Only OTP has lockout |

## Payments

| Feature | Status | Notes |
|---|---|---|
| M-Pesa STK Push (C2B) | ✅ Working | `mpesaService.initiateStkPush` |
| Webhook signature verification | ✅ Working | HMAC-SHA256 + timingSafeEqual |
| Escrow lifecycle (hold → release → refund) | ✅ Working | `escrow_transactions`, `escrow_accounts` |
| Commission calculation (global + per-category) | ✅ Working | `financeService.calculateCommission` |
| Commission debt recovery | ✅ Working | `fraudService.applyCommissionDebtDeduction` |
| Double-entry accounting ledger | ✅ Working | `accounting_ledger` table |
| Revenue dashboard | ✅ Working | `adminController.revenueDashboard` |
| Payout request workflow | ✅ Working | `payoutController.requestPayout` with 5 protection checks |
| M-Pesa B2C payout (automated) | ❌ Missing | Admin manually completes payouts |
| Actual refund to customer M-Pesa | ❌ Missing | Only ledger entry, no reversal API |
| Card payments (Stripe) | ❌ Missing | Deps installed, never imported |
| Tax / VAT calculation | ❌ Missing | No tax column |
| PDF invoices / receipts | ❌ Missing | No PDF generation |
| Split payments | ❌ Missing | Single escrow payment only |
| Tips / gratuities | ❌ Missing | Not implemented |

## Maps

| Feature | Status | Notes |
|---|---|---|
| Google Maps (optional) | ✅ Working | `GoogleMapsProvider.tsx` — requires `VITE_GOOGLE_MAPS_API_KEY` |
| OpenStreetMap fallback | ✅ Working | `OsmLiveTrackingMap.tsx`, `OsmSearchingRadarMap.tsx` |
| Live fundi GPS tracking | ✅ Working | Socket.IO `fundi:location:update` + `useAnimatedPosition` |
| Route visualization | ✅ Working | `RouteOverlay.tsx` with progressive draw animation |
| Custom markers (customer/fundi/admin/job) | ✅ Working | `MapMarkers.tsx` with role-specific colors + badges |
| Geocoding + reverse geocoding | ✅ Working | `mapsController.js` — Google + OSM Nominatim fallback |
| Directions with ETA | ✅ Working | `mapsController.directions` — Google + naive fallback |
| Fundi search (approved only) | ✅ Working | `fundiController.searchFundis` with 5 server-side filters |
| Smart ranking (distance + quality + rating + trust) | ✅ Working | `searchFundis` sort with quality_score |
| Turn-by-turn navigation | ❌ Missing | Route overlay only |
| Map clustering (100+ markers) | ❌ Missing | Will clutter with many fundis |
| Surge pricing map overlay | ❌ Missing | No surge pricing |

## Database

### Migrations (12 files)
1. `001_initial_schema.sql` — 18 core tables
2. `002_extended_schema.sql` — 7 extension tables
3. `003_platform_settings.sql` — settings table
4. `004_email_verification.sql` — email_verified_at column
5. `005_finance_compliance.sql` — 4 finance tables + payment columns
6. `006_fraud_detection_system.sql` — 7 fraud tables + 3 immutability triggers
7. `007_storage_r2.sql` — 2 storage tables + fundi columns
8. `008_identity_verification.sql` — 4 verification tables + columns
9. `009_enterprise_rbac.sql` — 4 RBAC tables + 1 trigger + role seeds
10. `010_ai_command_center.sql` — 1 AI table + 1 trigger
11. `011_scheduled_jobs_support_tickets.sql` — scheduled_at + ticket columns
12. `012_enterprise_systems.sql` — 7 enterprise tables + 1 trigger

### Stats
- **55 tables** total
- **~48 indexes**
- **~55 foreign keys**
- **6 immutability triggers** (audit_logs, fraud_detection_events, trust_score_history, staff_login_history, ai_recommendations, commission_history)
- **0 views** (none created)
- **0 stored procedures** (all logic in JS services)

## API Reference

### Authentication
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Customer register + OTP |
| POST | `/api/auth/register/fundi` | ❌ | Public fundi register (multipart) |
| POST | `/api/auth/login` | ❌ | Login (email verified required) |
| POST | `/api/auth/logout` | ❌ | Revoke refresh token |
| POST | `/api/auth/refresh` | ❌ | Rotate refresh token |
| POST | `/api/auth/otp-verify` | ❌ | Verify OTP |
| POST | `/api/auth/otp-resend` | ❌ | Resend OTP |
| POST | `/api/auth/forgot-password` | ❌ | Send reset OTP |
| POST | `/api/auth/reset-password` | ❌ | Reset via OTP or token |

### Users
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/users/me` | ✅ | Get own profile |
| PUT | `/api/users/me` | ✅ | Update profile |
| GET/PUT | `/api/users/settings` | ✅ | Get/update settings |
| GET/POST/PUT/DELETE | `/api/users/saved-places[/:id]` | ✅ | Saved places CRUD |
| POST | `/api/users/change-password` | ✅ | Change password |
| POST | `/api/users/delete-account` | ✅ | Soft-delete account |

### Jobs
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | `/api/jobs` | ✅ | Customer | Create job |
| GET | `/api/jobs` | ✅ | Any | List own jobs |
| GET | `/api/jobs/:id` | ✅ | Participant | Get job details |
| POST | `/api/jobs/:id/photos` | ✅ | Participant | Upload photos |
| PATCH | `/api/jobs/:id/status` | ✅ | Participant | Update status |
| POST | `/api/jobs/:id/accept` | ✅ | Approved Fundi | Accept job |
| POST | `/api/jobs/:id/check-in` | ✅ | Assigned Fundi | Check in with GPS |
| POST | `/api/jobs/:id/complete` | ✅ | Assigned Fundi | Complete (generates OTP) |
| POST | `/api/jobs/:id/confirm-completion` | ✅ | Customer | Confirm with OTP |
| POST | `/api/jobs/:id/review` | ✅ | Customer | Submit review |
| GET | `/api/jobs/fundi/active` | ✅ | Approved Fundi | Get active/matching job |

### Payments
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/stk-push` | ✅ | Initiate M-Pesa payment |
| POST | `/api/payments/webhook` | ❌ | M-Pesa callback (signature-verified) |
| GET | `/api/payments/job/:jobId` | ✅ | Payment for job |
| GET | `/api/payments/escrow/:jobId` | ✅ | Escrow transactions |
| GET | `/api/payments/wallet/balance` | ✅ | Fundi wallet balance |

### Admin (44 routes — all require `authRequired + requireRole('admin')`)
Dashboard, fundis CRUD, approve/reject/suspend, customers, jobs, payments, transactions, escrow, payouts, disputes, audit logs, reports, revenue, fraud dashboard, security, settings.

### Staff (14 permission-scoped routes)
Each requires `authRequired + requirePermission(code)` — see ROLE_PERMISSIONS.md.

### AI (5 routes — super_admin only)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/dashboard` | AI overview + pending counts |
| POST | `/api/ai/run` | Trigger full analysis |
| GET | `/api/ai/recommendations` | List with filters |
| POST | `/api/ai/recommendations/:id/review` | Mark reviewed/dismissed |
| GET | `/api/ai/insights/:category` | Category-specific insights |

### Enterprise (18 routes)
Quality scores, internal notes, referrals, loyalty, escalations, SLA, commission control, staff list.

## Production Deployment

### Render (Backend)
1. Link repo on Render → use `render.yaml` blueprint
2. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `R2_*`, `MPESA_*`, `RESEND_API_KEY`
3. Render runs `npm install` → `npm start` (which runs migrations via `prestart`)
4. Health check at `/health` reports all subsystems

### Vercel (Frontend)
1. Link repo on Vercel
2. Set `VITE_API_URL` and `VITE_SOCKET_URL` to Render backend URL
3. Vercel builds with `npm run build` → serves `dist/`

### Required Environment Variables
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (32+ chars) |
| `REFRESH_TOKEN_SECRET` | ✅ | Refresh token secret (32+ chars) |
| `COOKIE_SECURE` | ✅ prod | `true` in production |
| `FRONTEND_ORIGIN` | ✅ | Vercel frontend URL |
| `R2_ACCOUNT_ID` | Prod | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Prod | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Prod | Cloudflare R2 |
| `MPESA_CONSUMER_KEY` | Prod | Daraja API |
| `MPESA_CONSUMER_SECRET` | Prod | Daraja API |
| `MPESA_SHORTCODE` | Prod | Paybill/Till number |
| `MPESA_PASSKEY` | Prod | Daraja passkey |
| `MPESA_CALLBACK_URL` | Prod | Webhook URL on Render |
| `MPESA_CALLBACK_SECRET` | Prod | Webhook auth secret (set once, never auto-rotate) |
| `RESEND_API_KEY` | Prod | Email delivery |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional | Google Maps (OSM fallback works without) |

## Testing

### Manual E2E Scripts
```bash
node scripts/full_audit.mjs        # 114 API + security checks
node scripts/e2e_journeys.mjs      # 56 user journey checks
node scripts/commission_e2e.mjs    # 18 commission system checks
node scripts/realtime_audit.mjs    # 8 socket security checks
node scripts/load_test.mjs         # 100 concurrent users
node scripts/db_integrity.mjs      # 240 column integrity checks
```

### Run all
```bash
pkill -f "node backend/src/server.js"
rm -rf .pgdata
npm run dev &
sleep 10
node scripts/full_audit.mjs
node scripts/e2e_journeys.mjs
node scripts/commission_e2e.mjs
```

## Operational Docs

- [Launch Checklist](docs/launch-checklist.md)
- [Incident Recovery](docs/incident-recovery.md)
- [Database Backup](docs/database-backup.md)
- [Fraud Response](docs/fraud-response.md)
- [Fundi Verification](docs/fundi-verification.md)

## Project Structure

```
Patafundi-9bhsw1/
├── backend/
│   ├── migrations/          # 12 SQL migrations (55 tables)
│   ├── scripts/             # DB setup, seed, migrate
│   └── src/
│       ├── controllers/     # 18 controllers
│       ├── middleware/      # 7 middleware (auth, rbac, rateLimit, upload, etc.)
│       ├── services/        # 13 services (fraud, ai, storage, mpesa, etc.)
│       ├── config.js        # Env loading + auto-.env creation
│       ├── db.js            # Postgres pool + PGlite fallback
│       ├── realtime.js      # Socket.IO with JWT auth
│       ├── routes.js        # ~175 API routes
│       └── server.js        # Express app + startup
├── src/                     # React frontend
│   ├── components/          # 110+ components (maps, staff, admin, UI)
│   ├── pages/               # 50+ pages (customer, fundi, admin, staff)
│   ├── lib/                 # API client, motion, maps utils
│   ├── hooks/               # Realtime, GPS, animated position
│   └── routes/              # App routes + guards
├── scripts/                 # 7 E2E audit scripts
├── docs/                    # 5 operational playbooks
├── render.yaml              # Render blueprint
├── vercel.json              # Vercel config
├── docker-compose.yml       # Local Postgres
└── package.json             # 90+ dependencies
```

## License

Proprietary — PataFundi © 2026
