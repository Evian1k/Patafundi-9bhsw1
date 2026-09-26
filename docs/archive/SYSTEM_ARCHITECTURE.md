# PataFundi — End-to-End System Architecture

> **How the entire PataFundi platform functions end-to-end: from user signup to fundi payout, across frontend, backend, database, realtime, payments, and infrastructure.**

---

## 1. System at a Glance

```
                              ┌─────────────────────────────────────┐
                              │        END USERS (Browser)          │
                              │  Customer • Fundi • Staff • Admin   │
                              └──────────────┬──────────────────────┘
                                             │ HTTPS
                                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │              CDN / EDGE LAYER                    │
                  │  Vercel (Frontend SPA — React + Vite + TS)      │
                  │  https://patafundi-9bhsw1-xxx.vercel.app        │
                  │  • Static HTML/JS/CSS served globally            │
                  │  • SPA routing via rewrites to /index.html       │
                  └──────────────┬───────────────────────────────────┘
                                 │ REST API + WebSocket
                                 │ (VITE_API_URL, VITE_SOCKET_URL)
                                 ▼
                  ┌──────────────────────────────────────────────────┐
                  │           APPLICATION LAYER (Render)             │
                  │  Node.js + Express 5 + Socket.IO 4              │
                  │  https://patafundi-9bhsw1.onrender.com          │
                  │  • 216 REST routes across 18 controllers         │
                  │  • 11 socket events for realtime                 │
                  │  • 7 middleware (auth, rbac, rate-limit, csrf…)  │
                  │  • 14 services (mpesa, email, storage, fraud…)   │
                  │  • 2 cron jobs (fraud scan, scheduled jobs)      │
                  └──────────────┬───────────────────────────────────┘
                                 │ Parameterized SQL
                                 ▼
                  ┌──────────────────────────────────────────────────┐
                  │            DATA LAYER (Neon PostgreSQL)          │
                  │  67 tables • 100 FKs • 91 indexes • 16 migrations│
                  │  PII encrypted via AES-256-GCM (optional)       │
                  └──────────────────────────────────────────────────┘

         External integrations (called by Application Layer):
         ┌────────────────┬────────────────┬────────────────┐
         │  M-Pesa Daraja │  Cloudflare R2 │   Resend Email │
         │   (payments)   │   (file store) │   (transac.)   │
         ├────────────────┼────────────────┼────────────────┤
         │ Google Maps    │ Firebase FCM   │  Gemini AI     │
         │   (geo/route)  │   (push notif) │  (recommend.)  │
         ├────────────────┼────────────────┼────────────────┤
         │ Africa's Talk. │ AWS Rekognit.  │   Stripe       │
         │    (SMS)       │ (face verify)  │  (cards — opt) │
         └────────────────┴────────────────┴────────────────┘
```

---

## 2. The Three User Personas

PataFundi is a **two-sided marketplace** with a third operational layer (staff). Every feature is designed for one of these three personas:

| Persona | Goal | Primary Surface |
|---------|------|-----------------|
| **Customer** | Hire a verified fundi for a home service, pay safely, track the fundi live | Mobile-first web app (`/dashboard`, `/create-job`, `/job/:id/tracking`) |
| **Fundi** | Get jobs, complete them, get paid into M-Pesa wallet | Mobile-first web app (`/fundi`, `/fundi/job/:id`, `/fundi/wallet`) |
| **Staff** | Operate the marketplace: approve fundis, resolve disputes, monitor fraud, manage payouts | Admin/staff portals (`/admin/*`, `/staff/*`) |

---

## 3. Customer Journey — End to End

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. SIGNUP                                                                    │
│    Customer opens /auth → enters name/email/password                         │
│    → POST /api/auth/register                                                 │
│    → Backend creates user (role=customer, email_verified=false)              │
│    → Backend generates 6-digit OTP, hashes it, stores in otp_codes table     │
│    → In dev: OTP returned in response. In prod: OTP sent via Resend email    │
│                                                                              │
│ 2. OTP VERIFICATION                                                          │
│    Customer enters OTP                                                       │
│    → POST /api/auth/otp-verify                                               │
│    → Backend compares bcrypt hash, marks email_verified=true                 │
│    → Backend issues JWT access token (15 min) + refresh token (7 days)       │
│    → Backend sets httpOnly cookies: access_token, refresh_token, csrf_token  │
│    → User redirected to /dashboard                                           │
│                                                                              │
│ 3. CREATE JOB                                                                │
│    Customer opens /create-job                                                │
│    Selects service category (plumbing, electrical, etc.)                     │
│    Picks location on map (LocationPicker → Google Maps or OSM fallback)      │
│    Enters description, uploads photos, sets budget                           │
│    → POST /api/jobs (with CSRF token)                                        │
│    → Backend creates job with status=matching                                │
│    → Backend emits socket event "job:available" to nearby online fundis      │
│    → Job appears in fundi dashboards within seconds                          │
│                                                                              │
│ 4. FUNDI MATCHING                                                            │
│    Nearby approved fundis see the job in /fundi dashboard                    │
│    First fundi to accept wins the job                                        │
│    → POST /api/jobs/:id/accept (fundi token)                                 │
│    → Backend verifies fundi is approved + not on another active job          │
│    → Backend updates job status=accepted, fundi_id=accepted_fundi            │
│    → Backend emits "job:assigned" to customer                                 │
│    → Customer sees "Fundi assigned" notification                              │
│                                                                              │
│ 5. LIVE TRACKING                                                             │
│    Customer opens /job/:id/tracking                                          │
│    → React opens Socket.IO connection with JWT auth                          │
│    → Customer joins job-specific room (verified via ownership check)         │
│    Fundi periodically sends GPS pings                                        │
│    → Fundi client emits "fundi:location" → backend validates ownership       │
│    → Backend broadcasts "fundi:location:update" to customer in that room     │
│    → Customer sees fundi marker move on map (Leaflet or Google Maps)         │
│    → Backend also stores GPS history in gps_history table                    │
│                                                                              │
│ 6. CHAT                                                                      │
│    Customer & fundi can chat in real time                                    │
│    → POST /api/jobs/:jobId/messages (persisted) OR socket "chat:message"     │
│    → Backend stores in chat_messages table with client_message_id (dedup)    │
│    → Backend emits "chat:message" to the other party                         │
│    → Attachments uploaded via signed R2 URLs (8MB limit, MIME-filtered)      │
│                                                                              │
│ 7. JOB COMPLETION                                                            │
│    Fundi arrives, taps "Check In" → POST /api/jobs/:id/check-in              │
│    Fundi completes work, taps "Complete" → POST /api/jobs/:id/complete       │
│    → Backend generates 6-digit completion OTP, sends to customer             │
│    Customer enters OTP to confirm → POST /api/jobs/:id/confirm-completion    │
│    → Backend verifies OTP, sets job status=completed                         │
│    → Escrow releases to fundi wallet                                         │
│    → Revenue ledger records platform commission (default 15%)                │
│                                                                              │
│ 8. PAYMENT                                                                   │
│    Before completion, customer must pay via M-Pesa STK push                  │
│    → POST /api/payments/stk-push                                             │
│    → Backend calls Daraja API → M-Pesa prompt on customer's phone            │
│    → Customer enters PIN → M-Pesa calls /api/payments/daraja-callback        │
│    → Backend verifies callback signature, dedupes via processed_webhook table│
│    → Backend updates payment status=paid, holds funds in escrow              │
│    → On job completion: escrow releases (85% to fundi, 15% platform)         │
│                                                                              │
│ 9. REVIEW                                                                    │
│    Customer rates fundi 1-5 stars + written feedback                         │
│    → POST /api/jobs/:id/review                                               │
│    → Backend stores in reviews table                                         │
│    → Updates fundi's rolling average rating in fundis table                  │
│    → Updates fundi_quality_scores table (quality algorithm)                  │
│                                                                              │
│ 10. POST-JOB FEATURES                                                        │
│     - Save fundi to favorites (POST /api/favorites/fundis)                   │
│     - Earn loyalty points (auto: 1 point per KES spent)                      │
│     - Refer friends via referral code (GET /api/referrals/me)                │
│     - View job history (GET /api/jobs)                                       │
│     - Open dispute if unhappy (POST /api/disputes)                           │
│     - Trigger SOS if unsafe (POST /api/sos/trigger)                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Fundi Journey — End to End

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. PUBLIC REGISTRATION                                                       │
│    Fundi opens /register/fundi (no login required)                           │
│    Enters name, email, phone, password, service category                     │
│    Uploads: ID front, ID back, selfie (multipart/form-data)                  │
│    → POST /api/auth/register/fundi                                           │
│    → Backend creates user (role=fundi_pending)                               │
│    → Backend creates fundis row (approval_status=pending)                    │
│    → Backend stores uploaded files in R2 (or local fallback in dev)          │
│    → Backend creates verification_documents entries (3 rows)                 │
│    → OTP sent to email                                                       │
│                                                                              │
│ 2. OTP VERIFICATION                                                          │
│    Same as customer — email_verified=true, JWT issued                        │
│    But role remains fundi_pending (cannot accept jobs yet)                   │
│                                                                              │
│ 3. IDENTITY VERIFICATION                                                     │
│    Backend runs automated checks:                                            │
│    - AWS Rekognition face match (selfie vs ID photo)                         │
│    - Blur score detection                                                    │
│    - Duplicate face detection (one person, one account)                      │
│    - Liveness check (challenge-response via webcam frames)                   │
│    → Results stored in liveness_sessions, verification_documents             │
│                                                                              │
│ 4. ADMIN APPROVAL                                                            │
│    Admin opens /admin/fundis → sees pending fundi with verification photos   │
│    Admin reviews documents, identity check results, selfie                   │
│    Admin clicks Approve → POST /api/admin/fundis/:id/approve                 │
│    → Backend updates fundis.approval_status=approved                         │
│    → Backend updates users.role=fundi (from fundi_pending)                   │
│    → Backend emits notification to fundi ("You're approved!")                │
│    → Fundi can now go online and accept jobs                                 │
│                                                                              │
│ 5. GO ONLINE                                                                 │
│    Fundi opens /fundi dashboard, taps "Go Online"                            │
│    → POST /api/fundi/status/online                                           │
│    → Backend updates fundi_availability table                                │
│    → Fundi now appears in nearby-fundi searches                              │
│    → Fundi receives job:available socket events                              │
│                                                                              │
│ 6. ACCEPT JOB                                                                │
│    Fundi sees job card with customer location, budget, service type          │
│    Fundi taps Accept → POST /api/jobs/:id/accept                             │
│    → Backend verifies fundi is approved + within service radius              │
│    → Backend sets job.fundi_id, status=accepted                              │
│    → Customer notified via socket + push notification                        │
│                                                                              │
│ 7. NAVIGATE TO CUSTOMER                                                      │
│    Fundi opens /fundi/job/:id → sees customer location on map               │
│    Fundi taps "Start Navigation" → opens Google Maps directions              │
│    Fundi's app periodically sends GPS pings:                                 │
│    → POST /api/fundi/location (every 10 seconds while in transit)            │
│    → Backend stores in gps_history                                            │
│    → Backend emits "fundi:location:update" to customer for live tracking     │
│                                                                              │
│ 8. CHECK IN                                                                  │
│    Fundi arrives at customer location, taps "Check In"                       │
│    → POST /api/jobs/:id/check-in                                             │
│    → Backend verifies geolocation proximity to customer                      │
│    → Backend records check_in_at timestamp in jobs table                     │
│    → Backend adds job_timeline event                                         │
│                                                                              │
│ 9. COMPLETE JOB                                                              │
│    Fundi completes work, taps "Mark Complete"                                │
│    → POST /api/jobs/:id/complete                                             │
│    → Backend generates 6-digit completion OTP                                │
│    → Backend sends OTP to customer via email + push                          │
│    → Job status=awaiting_confirmation                                        │
│                                                                              │
│ 10. CUSTOMER CONFIRMS                                                        │
│     Customer enters OTP → confirm-completion                                 │
│     → Job status=completed                                                   │
│     → Escrow releases 85% to fundi wallet (15% platform commission)          │
│     → Fundi receives "Payment received" notification                         │
│                                                                              │
│ 11. WALLET & PAYOUT                                                          │
│     Fundi opens /fundi/wallet → sees balance + transaction history           │
│     Fundi taps "Withdraw to M-Pesa" → enters amount + phone                  │
│     → POST /api/fundi/wallet/withdraw-request                                │
│     → Backend creates payouts row (status=pending)                           │
│     → Admin/finance reviews → POST /api/payouts/request (B2C M-Pesa)         │
│     → Backend calls Daraja B2C API → money sent to fundi's M-Pesa            │
│     → Backend updates payouts.status=completed, deducts wallet balance       │
│                                                                              │
│ 12. QUALITY & RATINGS                                                        │
│     Customer leaves review → fundi_quality_scores updated                    │
│     Quality score = weighted avg of: rating, completion rate, on-time rate,  │
│     dispute rate, response time                                              │
│     High quality → appears higher in customer searches                       │
│     Low quality → flagged for review, may be suspended                       │
│                                                                              │
│ 13. SUBSCRIPTION (optional)                                                  │
│     Fundi can subscribe for premium features (priority matching, lower       │
│     commission rate) via POST /api/subscriptions/activate                    │
│     Subscription managed in subscriptions table                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Staff Journey — End to End

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STAFF LOGIN                                                                  │
│ Staff open /staff/login (separate from customer /auth)                       │
│ Backend rejects customer/fundi tokens — staff-only endpoint                  │
│ → POST /api/auth/login with role check                                       │
│ → Staff JWT issued with role + permissions array                              │
│                                                                              │
│ 8 STAFF ROLES — each sees different dashboard                                │
│ ┌─────────────────┬─────────────────────────────────────────────────────────┐│
│ │ super_admin     │ Executive Dashboard, AI Center, Staff Mgmt, Commission, ││
│ │                 │ Revenue, Fraud, Users, Fundis, Payments, System, Audit, ││
│ │                 │ Integrations, Feature Flags, Maintenance Mode           ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ admin           │ Fundi approvals, Job mgmt, Dispute escalation           ││
│ │                 │ (legacy role — super_admin is preferred)                ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ ops_manager     │ Jobs, Fundis, Approvals, Assignments, Operations        ││
│ │                 │ CANNOT: AI center, role mgmt, commission controls       ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ support_agent   │ Disputes, Tickets, Customer support, Escalations        ││
│ │                 │ CANNOT: Payments, Roles, Commission controls            ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ fraud_analyst   │ Fraud Dashboard, Investigations, Risk Flags             ││
│ │                 │ CANNOT: Finance, Commission controls                    ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ finance_team    │ Payments, Revenue, Escrow, Refunds, Payouts, Commission ││
│ │                 │ CANNOT: Role management                                  ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ dispatch_team   │ Live Jobs, Assignments, Maps, Availability              ││
│ │                 │ CANNOT: Most admin routes                                ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ devops_engineer │ System Health, Queues, Logs, Metrics, Monitoring        ││
│ │                 │ CANNOT: Most admin routes                                ││
│ ├─────────────────┼─────────────────────────────────────────────────────────┤│
│ │ auditor         │ Read-only view, Audit Logs, Compliance Reports          ││
│ │                 │ CANNOT: Modify anything (POST/PUT/DELETE blocked)       ││
│ └─────────────────┴─────────────────────────────────────────────────────────┘│
│                                                                              │
│ RBAC ENFORCEMENT                                                             │
│ Every privileged route wrapped in:                                           │
│   authRequired → requirePermission('can_approve_fundis')                     │
│ → Middleware checks role_permissions table                                   │
│ → super_admin short-circuits to true                                         │
│ → All attempts logged in audit_logs table                                    │
│ → Unauthorized attempts return 403 with descriptive message                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Realtime (Socket.IO) Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SOCKET.IO CONNECTION LIFECYCLE                                              │
│                                                                             │
│ Client (browser)                          Server (Node.js)                  │
│ ─────────────────                         ─────────────────                 │
│ 1. io(url, { auth: { token: JWT } })  →   2. Verify JWT, reject if invalid │
│ 3. Connection established             ←   4. Emit "connected"              │
│ 5. emit "join:room", { jobId }         →   6. Verify caller owns/fundi on  │
│                                            job (DB lookup)                  │
│ 7. socket.join(`job:${jobId}`)         ←   8. Acknowledge room join        │
│                                                                             │
│ SOCKET EVENTS                                                               │
│ ┌────────────────────────┬──────────────────────────────────────────────┐  │
│ │ EVENT                  │ FLOW                                          │  │
│ ├────────────────────────┼──────────────────────────────────────────────┤  │
│ │ fundi:location:update  │ Fundi client emits GPS ping → server stores  │  │
│ │                        │ in gps_history → server broadcasts to        │  │
│ │                        │ customer in same job room                    │  │
│ ├────────────────────────┼──────────────────────────────────────────────┤  │
│ │ chat:message           │ Either party emits text → server persists to │  │
│ │                        │ chat_messages (with client_message_id dedup) │  │
│ │                        │ → server broadcasts to other party           │  │
│ ├────────────────────────┼──────────────────────────────────────────────┤  │
│ │ job:status:update      │ Backend emits when job status changes        │  │
│ │                        │ (accepted, in_progress, completed) → both    │  │
│ │                        │ parties notified                             │  │
│ ├────────────────────────┼──────────────────────────────────────────────┤  │
│ │ job:assigned           │ Backend emits to customer when fundi accepts │  │
│ ├────────────────────────┼──────────────────────────────────────────────┤  │
│ │ notification:new       │ Backend emits when notification created      │  │
│ │                        │ (new message, job update, payment)           │  │
│ └────────────────────────┴──────────────────────────────────────────────┘  │
│                                                                             │
│ SECURITY                                                                    │
│ • JWT required on connection (no anonymous sockets)                         │
│ • Room joins verified via DB ownership check                                │
│ • Customer cannot join another customer's job room                          │
│ • Customer cannot spoof fundi:location:update (role check)                  │
│ • Fundi cannot join another fundi's job room                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Payment & Escrow Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PAYMENT LIFECYCLE                                                            │
│                                                                             │
│ 1. Customer creates job                                                     │
│    → job.estimated_price = 2000 KES                                         │
│                                                                             │
│ 2. Fundi accepts + completes job                                            │
│    → Job status=awaiting_payment                                           │
│                                                                             │
│ 3. Customer initiates payment                                               │
│    → POST /api/payments/stk-push { jobId, phone }                          │
│    → Backend computes expected_commission = 15% × 2000 = 300 KES           │
│    → Backend stores in expected_commissions table (for audit)              │
│    → Backend calls Daraja STK Push API                                      │
│    → M-Pesa prompts customer on phone                                       │
│    → payment row created: status=pending, amount=2000                      │
│                                                                             │
│ 4. Customer pays on phone                                                   │
│    → M-Pesa calls /api/payments/daraja-callback                            │
│    → Backend verifies callback secret (HMAC)                                │
│    → Backend checks processed_webhook_callbacks table (dedup)              │
│    → Backend updates payment.status=paid                                    │
│    → Backend creates escrow_transactions row (holds 2000 KES)              │
│    → Backend notifies customer + fundi via socket                           │
│                                                                             │
│ 5. Job completion triggers escrow release                                   │
│    → POST /api/jobs/:id/confirm-completion (with OTP)                      │
│    → Backend releases escrow:                                               │
│       - 1700 KES → fundi wallet (wallets table)                             │
│       - 300 KES → platform revenue (revenue_ledger table)                  │
│    → commission_history row created (audit trail)                          │
│    → accounting_ledger entries (double-entry bookkeeping)                  │
│                                                                             │
│ 6. Fundi requests payout                                                    │
│    → POST /api/fundi/wallet/withdraw-request { amount, phone }             │
│    → payouts row created: status=pending                                    │
│    → Finance team reviews in /staff/commission dashboard                    │
│    → Finance approves → POST /api/payouts/request                           │
│    → Backend calls Daraja B2C API → money sent to fundi's M-Pesa           │
│    → payouts.status=completed                                               │
│    → wallets.balance decremented                                            │
│                                                                             │
│ 7. Replay protection                                                        │
│    → Every M-Pesa callback has unique CheckoutRequestID                    │
│    → processed_webhook_callbacks table dedupes                             │
│    → Replay attack → 404 (already processed)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Fraud Detection System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRAUD DETECTION — runs every 15 minutes via setInterval (cron)              │
│                                                                             │
│ RULE ENGINE CHECKS:                                                         │
│ 1. Multiple accounts on same device/IP                                      │
│ 2. Same M-Pesa receipt used twice                                          │
│ 3. Fundi completes job without GPS history (didn't travel)                 │
│ 4. Customer cancels jobs repeatedly after fundi travels                     │
│ 5. Fundi + customer always paired (collusion)                               │
│ 6. Unrealistic completion times (< 5 min for major jobs)                    │
│ 7. Mismatched service category vs actual work                               │
│ 8. Payment amount ≠ job estimated price                                     │
│                                                                             │
│ ML SCORING:                                                                 │
│ → user_fraud_scores table — per-user risk score 0-100                       │
│ → Score updated on each new event                                           │
│ → Score >70 → user flagged in fraud_alerts table                            │
│ → Score >90 → account auto-suspended (configurable)                         │
│                                                                             │
│ COMMISSION DEBT TRACKING                                                    │
│ → If fundi owed commission but didn't pay (subscription lapse)              │
│ → commission_debts table tracks owed amount                                 │
│ → Future earnings garnished until debt cleared                              │
│                                                                             │
│ STAFF TOOLS                                                                 │
│ → /staff/security (fraud_analyst role)                                      │
│ → View all fraud_alerts, investigate, dismiss or escalate                   │
│ → Suspicious jobs/users listed for manual review                            │
│ → All actions logged in audit_logs                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Notification System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NOTIFICATION CHANNELS                                                       │
│                                                                             │
│ IN-APP (always works)                                                       │
│ → notifications table (per-user inbox)                                      │
│ → /api/notifications endpoint                                               │
│ → Socket.IO "notification:new" event pushes to browser                      │
│ → Toast notification appears in UI                                          │
│                                                                             │
│ EMAIL (requires Resend creds)                                               │
│ → Resend SDK (services/emailService.js)                                     │
│ → Used for: OTP codes, payment receipts, fundi approval, dispute updates    │
│ → In dev: falls back to console.log                                         │
│                                                                             │
│ SMS (requires Africa's Talking creds)                                       │
│ → services/smsService.js                                                    │
│ → Used for: critical alerts (SOS, payment failures), OTP for non-smartphone │
│ → In dev: falls back to console.log                                         │
│                                                                             │
│ PUSH (requires Firebase FCM creds)                                          │
│ → services/pushService.js                                                   │
│ → Used for: new job alerts to fundis, job status updates to customers       │
│ → Device tokens stored in user_device_tokens table                          │
│ → 14 fallback branches — gracefully degrades without FCM                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PRODUCTION DEPLOYMENT                                                       │
│                                                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐  │
│ │ GITHUB (source of truth)                                              │  │
│ │ repo: Evian1k/Patafundi-9bhsw1                                       │  │
│ │ branches: main (production)                                           │  │
│ └────────────────────┬──────────────────────────────────────────────────┘  │
│                      │                                                      │
│         ┌────────────┴───────────────┐                                      │
│         ▼                            ▼                                      │
│ ┌──────────────────┐         ┌──────────────────┐                          │
│ │   VERCEL         │         │     RENDER       │                          │
│ │   (Frontend)     │         │   (Backend)      │                          │
│ │                  │         │                  │                          │
│ │ • Auto-deploys   │         │ • Auto-deploys   │                          │
│ │   on git push    │         │   on git push    │                          │
│ │ • Builds with    │         │ • Runs Node.js   │                          │
│ │   vite build     │         │   server         │                          │
│ │ • Serves dist/   │         │ • Express +      │                          │
│ │   on global CDN  │         │   Socket.IO      │                          │
│ │                  │         │ • Connects to    │                          │
│ │ Env vars:        │         │   Neon Postgres  │                          │
│ │ VITE_API_URL     │         │                  │                          │
│ │ VITE_SOCKET_URL  │         │ Env vars:        │                          │
│ │ VITE_GOOGLE_     │         │ DATABASE_URL     │                          │
│ │   MAPS_API_KEY   │         │ JWT_SECRET       │                          │
│ │                  │         │ REFRESH_TOKEN_   │                          │
│ │ URL:             │         │   SECRET         │                          │
│ │ patafundi-xxx.   │         │ FRONTEND_ORIGIN  │                          │
│ │   vercel.app     │         │ MPESA_*          │                          │
│ │                  │         │ RESEND_API_KEY   │                          │
│ │                  │         │ R2_*             │                          │
│ │                  │         │ GOOGLE_MAPS_     │                          │
│ │                  │         │   SERVER_KEY     │                          │
│ │                  │         │ GEMINI_API_KEY   │                          │
│ │                  │         │                  │                          │
│ │                  │         │ URL:             │                          │
│ │                  │         │ patafundi-xxx.   │                          │
│ │                  │         │   onrender.com   │                          │
│ └────────┬─────────┘         └────────┬─────────┘                          │
│          │                            │                                     │
│          │       HTTPS REST +         │                                     │
│          │ <─── WebSocket ────────────┘                                     │
│          │                                                                  │
│          ▼                                                                  │
│ ┌──────────────────────────────────────────────────────────────────────┐   │
│ │ EXTERNAL SERVICES (called by backend)                                │   │
│ │                                                                      │   │
│ │  Neon Postgres  ─── Cloud database (serverless, autoscaling)         │   │
│ │  M-Pesa Daraja  ─── Payment processing (STK push, B2C)               │   │
│ │  Cloudflare R2  ─── File storage (verification docs, job photos)     │   │
│ │  Resend         ─── Transactional email                              │   │
│ │  Firebase FCM   ─── Push notifications                                │   │
│ │  Google Maps    ─── Geocoding, directions                             │   │
│ │  Gemini AI      ─── Recommendations, advisory                         │   │
│ │  AWS Rekognition ── Face match, liveness                              │   │
│ │  Africa's Talking ── SMS                                              │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Security Architecture (Defense in Depth)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: NETWORK                                                             │
│ • HTTPS only (Vercel + Render enforce TLS)                                  │
│ • HSTS via helmet                                                            │
│ • CORS allowlist (no wildcard *)                                             │
│                                                                             │
│ LAYER 2: APPLICATION                                                         │
│ • Helmet security headers (CSP, X-Frame-Options, etc.)                      │
│ • Rate limiting (global + per-endpoint)                                     │
│ • CSRF protection (double-submit cookie)                                    │
│ • Input validation (115 manual checks, parameterized SQL)                   │
│ • File upload hardening (MIME + sharp decode + size + path traversal)       │
│                                                                             │
│ LAYER 3: AUTHENTICATION                                                      │
│ • bcrypt cost 12 for passwords                                              │
│ • JWT (HS256) with algorithm pinning                                        │
│ • Refresh token rotation (stored in DB, single-use)                         │
│ • 2FA via TOTP (otplib)                                                     │
│ • Account lockout after N failed attempts                                   │
│                                                                             │
│ LAYER 4: AUTHORIZATION                                                       │
│ • RBAC with 8 roles, 32 permissions                                         │
│ • Ownership checks on all sensitive reads (IDOR protection)                 │
│ • Mass-assignment protection (explicit field extraction)                    │
│ • super_admin bypass for break-glass                                        │
│                                                                             │
│ LAYER 5: DATA                                                                │
│ • PII encryption (AES-256-GCM) for phone/email/ID — optional               │
│ • Audit logging on every privileged action                                  │
│ • Replay protection (webhook dedup, OTP single-use)                         │
│ • Soft deletes for user data (regulatory compliance)                        │
│                                                                             │
│ LAYER 6: MONITORING                                                          │
│ • All admin actions logged in audit_logs                                    │
│ • Staff login history (staff_login_history table)                           │
│ • Fraud detection (15-min cron)                                             │
│ • Document access logs (who viewed whose verification docs)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Database Schema Overview (67 tables)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CORE ENTITIES (10 tables)                                                   │
│  users, fundis, customers, jobs, payments, reviews,                         │
│  notifications, chat_messages, chat_attachments, gps_history               │
│                                                                             │
│ AUTH & SECURITY (10 tables)                                                 │
│  otp_codes, refresh_tokens, password_reset_tokens,                          │
│  permissions, role_permissions, user_permissions,                           │
│  staff_login_history, violations, liveness_sessions,                       │
│  verification_documents                                                     │
│                                                                             │
│ FINANCE (10 tables)                                                         │
│  escrow_accounts, escrow_transactions, revenue_ledger,                      │
│  accounting_ledger, payouts, wallets, commission_history,                   │
│  expected_commissions, commission_debts, subscriptions                      │
│                                                                             │
│ FRAUD & TRUST (6 tables)                                                    │
│  fraud_alerts, fraud_detection_events, user_fraud_scores,                   │
│  trust_scores, trust_score_history, processed_webhook_callbacks             │
│                                                                             │
│ JOB LIFECYCLE (6 tables)                                                    │
│  job_photos, job_status_updates, job_timeline,                              │
│  fundi_availability, fundi_portfolios, fundi_quality_scores                 │
│                                                                             │
│ DISPUTES & SUPPORT (5 tables)                                               │
│  disputes, dispute_files, support_tickets, escalations, sla_tracks         │
│                                                                             │
│ STAFF & ADMIN (5 tables)                                                    │
│  admin_actions, audit_logs, internal_notes, document_access_logs,           │
│  feature_flags                                                              │
│                                                                             │
│ USER ENRICHMENT (5 tables)                                                  │
│  favorite_fundis, saved_places, referrals, user_loyalty,                    │
│  user_device_tokens                                                         │
│                                                                             │
│ AI & RECOMMENDATIONS (1 table)                                              │
│  ai_recommendations                                                         │
│                                                                             │
│ CONTENT (5 tables)                                                          │
│  blog_posts, career_jobs, policies, service_categories,                     │
│  platform_settings                                                          │
│                                                                             │
│ MISC (4 tables)                                                             │
│  messages (legacy), sos_emergencies, api_integrations,                      │
│  schema_migrations                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. End-to-End Request Lifecycle (Example: Customer Creates Job)

```
1. User clicks "Create Job" in browser
   ↓
2. React form validates input (zod schema on frontend)
   ↓
3. React calls axios.post('/api/jobs', payload)
   ↓
4. Axios adds headers:
   - Cookie: access_token=eyJ...; csrf_token=abc123
   - X-CSRF-Token: abc123
   - Content-Type: application/json
   ↓
5. Request hits Vercel rewrite → /index.html (not relevant for API calls)
   → Actually: Vercel doesn't proxy API calls. Frontend calls Render directly
     via VITE_API_URL=https://patafundi-9bhsw1.onrender.com
   ↓
6. Request hits Render (Express server)
   ↓
7. Middleware chain:
   a. globalRateLimit (100 req/min per IP)
   b. helmet (security headers)
   c. cors (origin check against allowlist)
   d. express.json (body parse)
   e. csrfProtection (verify X-CSRF-Token matches csrf_token cookie)
   f. authRequired (verify JWT, populate req.user)
   g. (no RBAC for /api/jobs — customers can create jobs)
   ↓
8. Route handler: jobController.create
   a. Validate request body (manual checks)
   b. Insert into jobs table (parameterized SQL)
      INSERT INTO jobs (customer_id, service_category, ...) VALUES ($1, $2, ...)
   c. Insert into job_timeline (status=matching)
   d. Query nearby online fundis (within service radius)
   e. Emit socket event "job:available" to nearby fundi room
   f. Send push notification to nearby fundis (Firebase FCM)
   g. Commit transaction
   ↓
9. Response: 201 Created { success: true, job: { id, status, ... } }
   ↓
10. Frontend receives response
    → React updates UI (job created, redirect to /job/:id/tracking)
    → Socket.IO connection joins job room
    ↓
11. Within seconds:
    - Nearby fundis see job in their dashboard (via socket event)
    - Fundi accepts → customer gets "Fundi assigned" notification (socket + push)
    - Live tracking begins (fundi GPS pings flow via socket)
```

---

## 14. Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 18.3 |
| Frontend Build | Vite | 7.3 |
| Language | TypeScript | 5.5 |
| Styling | Tailwind CSS | 3.4 |
| UI Components | shadcn/ui + Radix | latest |
| State Management | Zustand + React Query | 5.0 + 5.56 |
| Routing | React Router | 6.26 |
| Maps | Leaflet + Google Maps | 1.9 + 2.20 |
| Charts | Recharts + Chart.js | 2.12 + 4.5 |
| 3D (mascot) | Three.js + R3F | 0.181 |
| Backend Runtime | Node.js | 20+ |
| Backend Framework | Express | 5.2 |
| Realtime | Socket.IO | 4.8 |
| Database | PostgreSQL (Neon) | 15+ |
| ORM | node-postgres (pg) | 8.21 |
| Auth | jsonwebtoken + bcryptjs | 9.0 + 3.0 |
| Validation | zod | 3.23 |
| Payments | M-Pesa Daraja API | v2 |
| File Storage | Cloudflare R2 (S3 SDK) | latest |
| Email | Resend | 6.12 |
| Push | Firebase FCM | latest |
| AI | Google Gemini | 0.24 |
| Face Verification | AWS Rekognition | 3.750 |
| Deployment | Vercel (frontend) + Render (backend) | — |
| CI/CD | GitHub Actions (lint + typecheck) | — |

---

## 15. Failure Modes & Graceful Degradation

| External Service | If It Fails... | System Behavior |
|-----------------|----------------|-----------------|
| M-Pesa Daraja | Payment fails | Job stays in `awaiting_payment`; customer can retry; escrow not released |
| Cloudflare R2 | Upload fails | Falls back to local `backend/uploads/` (dev) or returns 503 (prod) |
| Resend Email | OTP email fails | Falls back to console.log (dev); OTP stored in DB for dev retrieval |
| Firebase FCM | Push fails | Notification still in `notifications` table; user sees it on next page load |
| Google Maps | API key missing | Falls back to OpenStreetMap (Leaflet) — all map features still work |
| Gemini AI | API key missing | AI recommendations return empty; dashboards still render |
| AWS Rekognition | Not configured | Identity verification skipped; admin must manually verify documents |
| Neon DB | Connection fails | Server returns 503; auto-reconnect attempts; PGlite fallback in dev |
| Socket.IO | Disconnects | Client auto-reconnects with exponential backoff; missed events re-fetched via REST |

---

## 16. Production Scaling Path

```
CURRENT (works up to ~50 concurrent users)
└── Single Node.js process + Neon serverless DB

NEXT STEP (100-500 concurrent users)
├── Add PgBouncer in front of Neon (connection pooling)
├── Run 2-3 Node.js instances behind Render's load balancer
└── Add Redis for:
    - Distributed rate limiting
    - Socket.IO adapter (cross-instance socket routing)
    - Session sharing

FUTURE (1000+ concurrent users)
├── Horizontal autoscaling (Render Pro)
├── Read replicas on Neon
├── CDN for static assets (already on Vercel — ✅)
├── BullMQ + Redis for async jobs (email/SMS/push queue)
├── Database sharding by region (if international expansion)
└── Kubernetes if Render limits reached
```

---

## 17. Quick Start (Developers)

```bash
# 1. Clone
git clone https://github.com/Evian1k/Patafundi-9bhsw1.git
cd Patafundi-9bhsw1

# 2. Install deps
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://...  (get free at https://neon.tech)
#   JWT_SECRET=any-random-32+-char-string
#   REFRESH_TOKEN_SECRET=different-random-32+-char-string

# 4. Run database migrations
npm run db:migrate

# 5. Seed demo data (10 demo accounts)
npm run db:seed

# 6. Start both frontend + backend in dev mode
npm run dev
# Frontend: http://localhost:8080
# Backend:  http://localhost:4000

# 7. Build for production
npm run build
# Output: dist/ (static files for Vercel/Netlify)
```

---

## 18. Demo Accounts (Dev Only)

**Note:** These are visible ONLY in development mode (`npm run dev`). Production builds tree-shake demo credentials out of the bundle.

| Role | Email | Password |
|------|-------|----------|
| Customer | demo@patafundi.com | Demo@2024! |
| Fundi (approved) | fundi@patafundi.com | Fundi@2024! |
| Admin | admin@patafundi.com | Admin@2024! |
| Super Admin | superadmin@patafundi.com | SuperAdmin@2024! |
| Ops Manager | ops@patafundi.com | Ops@2024! |
| Support Agent | support@patafundi.com | Support@2024! |
| Fraud Analyst | fraud@patafundi.com | Fraud@2024! |
| Finance Team | finance@patafundi.com | Finance@2024! |
| Dispatch | dispatch@patafundi.com | Dispatch@2024! |
| Auditor | auditor@patafundi.com | Auditor@2024! |

Visit `/demo` in dev mode for one-click login to any account.

---

*This document describes the complete end-to-end functioning of PataFundi as of 2026-06-21. For audit results, see `FINAL_ENTERPRISE_ACCEPTANCE_AUDIT.md`. For deployment linking steps, see `LINKING_CHECKLIST.md`.*
