# Launch Checklist

Run this checklist top-to-bottom before opening PataFundi to real users.
Every item must be ✅ before the soft-launch announcement goes out.

## 1. Code & Deploy

- [ ] `git log origin/main` shows the latest commit hash
- [ ] Render dashboard → `patafundi-api` service → "Live" with latest commit SHA
- [ ] Vercel dashboard → `patafundi-9bhsw1` → "Ready" with latest commit SHA
- [ ] `curl https://patafundi-9bhsw1.onrender.com/health` returns `"status":"healthy"`
- [ ] Health response shows `build.sha` matching the latest GitHub commit
- [ ] Health response shows `subsystems.database.ok === true`
- [ ] Health response shows `subsystems.storage.r2Configured === true`
- [ ] Health response shows `subsystems.email.configured === true`
- [ ] Health response shows `subsystems.mpesa.configured === true`

## 2. Environment Variables (Render)

- [ ] `DATABASE_URL` — linked from Render PostgreSQL (not localhost)
- [ ] `JWT_SECRET` — generated (not empty)
- [ ] `REFRESH_TOKEN_SECRET` — generated (not empty)
- [ ] `COOKIE_SECURE=true`
- [ ] `FRONTEND_ORIGIN=https://patafundi.vercel.app`
- [ ] `R2_ACCOUNT_ID` — set
- [ ] `R2_ACCESS_KEY_ID` — set
- [ ] `R2_SECRET_ACCESS_KEY` — set
- [ ] `R2_BUCKET_NAME=patafundi`
- [ ] `RESEND_API_KEY` — set
- [ ] `EMAIL_FROM` — set (e.g. `hello@patafundi.com`)
- [ ] `MPESA_CONSUMER_KEY` — set
- [ ] `MPESA_CONSUMER_SECRET` — set
- [ ] `MPESA_SHORTCODE` — set
- [ ] `MPESA_PASSKEY` — set
- [ ] `MPESA_CALLBACK_URL` — `https://patafundi-9bhsw1.onrender.com/api/payments/daraja-callback`
- [ ] `MPESA_CALLBACK_SECRET` — generated (not empty)

## 3. Environment Variables (Vercel)

- [ ] `VITE_API_URL=https://patafundi-9bhsw1.onrender.com`
- [ ] `VITE_SOCKET_URL=https://patafundi-9bhsw1.onrender.com`

## 4. Database

- [ ] All 8 migrations applied (check `schema_migrations` table)
- [ ] `curl https://patafundi-9bhsw1.onrender.com/health` → no "relation does not exist" errors in logs
- [ ] Demo users NOT present in production (no `demo@patafundi.com`, `fundi@patafundi.com`, `admin@patafundi.com`)
- [ ] At least ONE admin account provisioned manually (via SQL or a one-time script)
- [ ] Daily backup schedule enabled on Render PostgreSQL

## 5. Cloudflare R2

- [ ] Bucket `patafundi` exists and is set to **private** (no public access)
- [ ] API token has read+write on the bucket only (not account-wide)
- [ ] Test: upload a verification doc as a fundi → confirm it appears in R2
- [ ] Test: try to access the R2 key directly (without signed URL) → must be denied

## 6. M-Pesa Daraja

- [ ] Production app registered on Safaricom Daraja
- [ ] Callback URL registered: `https://patafundi-9bhsw1.onrender.com/api/payments/daraja-callback`
- [ ] Test STK push with KES 1 to a real phone → callback received
- [ ] Test: duplicate callback does NOT create double escrow

## 7. Resend Email

- [ ] Domain verified (or using `onboarding@resend.dev` for testing)
- [ ] Test: register a new user → OTP email arrives within 30 seconds

## 8. Frontend

- [ ] `https://patafundi.vercel.app` loads without console errors
- [ ] Landing page renders correctly on mobile (375px), tablet (768px), desktop (1440px)
- [ ] Customer can register → OTP → login → create job
- [ ] Fundi can register (PUBLIC, no login required) → upload ID + selfie → OTP → pending
- [ ] Admin can login → approve fundi → fundi can accept jobs

## 9. E2E Audit Suite

- [ ] `API_URL=https://patafundi-9bhsw1.onrender.com node scripts/full_audit.mjs` → 0 failures
- [ ] `API_URL=https://patafundi-9bhsw1.onrender.com node scripts/realtime_audit.mjs` → 0 failures
- [ ] `node scripts/db_integrity.mjs` → 0 missing columns

## 10. Monitoring

- [ ] Render health check configured (`/health`, 60s interval)
- [ ] Render "Deploy Hook" URL saved (for triggering manual deploys)
- [ ] Sentry or equivalent error tracking connected (optional but recommended)
- [ ] At least one team member subscribed to Render deploy notifications

## 11. Go/No-Go

- [ ] All items above checked ✅
- [ ] Soft-launch cohort identified (10–20 beta users)
- [ ] On-call rotation set for the first 7 days
- [ ] Rollback plan documented (revert to previous Render deploy)

**If any item is unchecked, DO NOT launch.**
