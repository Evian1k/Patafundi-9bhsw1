# Incident Recovery

When PataFundi is down or degraded, follow this playbook. Don't think — execute.

## Severity Classification

| Severity | Definition | Response time |
|---|---|---|
| SEV-1 | Platform fully down, payments affected | < 15 min |
| SEV-2 | Major feature broken (login, job creation, payments) | < 1 hour |
| SEV-3 | Minor feature broken, workaround exists | < 4 hours |
| SEV-4 | Cosmetic / non-user-facing | Next business day |

## SEV-1: Platform Down

### 1. Verify the outage
```bash
curl -sf https://patafundi-9bhsw1.onrender.com/health
```
- If 200 → check frontend and specific endpoints; may be partial.
- If 503 or timeout → continue to step 2.

### 2. Check Render dashboard
- https://dashboard.render.com → `patafundi-api` service
- Look at "Events" tab for: deploys, crashes, OOM kills
- Look at "Logs" tab for the last 100 lines — search for `Error`, `ECONNREFUSED`, `OOM`

### 3. Common causes & fixes

#### A. Database unreachable
- **Symptom:** Health check shows `database.ok = false`, logs show `ECONNREFUSED`
- **Fix:** Render dashboard → `patafundi-db` → check if database is suspended (free tier sleeps after 90s idle). Click "Resume". Wait 30s. Re-check health.
- **Prevention:** Upgrade database to `starter` plan ($7/mo) — no sleep.

#### B. Migration not applied
- **Symptom:** Health 200 but endpoints return 503 with "relation does not exist"
- **Fix:** Render dashboard → `patafundi-api` → Shell → run `npm run db:migrate`. Verify all 8 migrations show as applied in `schema_migrations` table.
- **Prevention:** `bootstrap-production-db.js` runs before `npm start` — verify it's in the startup logs.

#### C. OOM / memory exhaustion
- **Symptom:** Render logs show `JavaScript heap out of memory` or `OOMKilled`
- **Fix:** Render dashboard → `patafundi-api` → Settings → upgrade instance type. Or reduce memory usage by killing the background fraud job temporarily.
- **Prevention:** Monitor memory; upgrade before hitting the limit.

#### D. Bad deploy
- **Symptom:** Outage started immediately after a deploy
- **Fix:** Render dashboard → `patafundi-api` → "Manual Deploy" → select the previous commit. Wait for deploy to complete.
- **Prevention:** Always run E2E suite against a preview deploy before promoting.

### 4. Communicate
- Post to status page (if configured) or team Slack: "PataFundi is investigating an outage. Will update in 15 minutes."
- Set a 15-minute timer. Update at the 15-minute mark regardless of progress.

### 5. Post-mortem
- Within 24 hours, write a brief post-mortem: timeline, root cause, fix, prevention.
- File as a GitHub issue tagged `incident`.

## SEV-2: Payments Broken

### 1. Identify the break point
- Customer can't initiate STK push → check M-Pesa Daraja status
- STK push works but callback never arrives → check callback URL in Daraja portal
- Callback arrives but escrow not created → check Render logs for webhook errors
- Escrow created but payout fails → check fundi's M-Pesa number + trust score

### 2. Stuck payments
If a payment is stuck in `pending` for > 10 minutes:
- Check if M-Pesa callback was received (Render logs, search for `CheckoutRequestID`)
- If callback never received → customer's phone may have rejected the prompt. Mark payment as `failed` via SQL:
  ```sql
  update payments set status = 'failed', failure_reason = 'Callback timeout', updated_at = now()
  where id = '<payment-id>' and status = 'pending';
  ```
- If callback received but not processed → check for errors in the webhook handler. May need to manually replay.

### 3. Stuck payouts
If a payout is stuck in `processing` for > 24 hours:
- Check if admin needs to manually complete via `POST /api/admin/payouts/:id/complete`
- If the fundi's M-Pesa number is invalid → mark payout as `failed`:
  ```sql
  update payouts set status = 'failed', updated_at = now() where id = '<payout-id>';
  ```

## Rollback Procedure

If a deploy is bad and can't be fixed quickly:

1. Render dashboard → `patafundi-api` → "Manual Deploy" → select previous commit
2. Wait for deploy to complete (~3 min)
3. Verify `/health` returns 200
4. Run `API_URL=https://patafundi-9bhsw1.onrender.com node scripts/full_audit.mjs`
5. If audit passes, communicate "Platform restored" to users
6. Do NOT auto-deploy until the broken commit is fixed and re-audited

## Contacts

- **Render support:** https://render.com/support
- **Cloudflare R2 status:** https://www.cloudflarestatus.com
- **Safaricom Daraja status:** https://developer.safaricom.co.ke
- **Resend status:** https://status.resend.com
