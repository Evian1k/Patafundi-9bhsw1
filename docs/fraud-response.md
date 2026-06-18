# Fraud Response Playbook

When a fraud alert fires or a user reports being scammed, follow this playbook.

## Alert Sources

1. **Automated fraud alerts** — visible at `/admin/security` (dashboard) or `GET /api/admin/fraud/alerts`
2. **User reports** — via `/api/fraud-report` or support email
3. **Pattern detection** — runs every 15 min in the background; creates alerts automatically

## Triage (5 minutes)

### 1. Open the fraud dashboard
- Production: `https://patafundi.vercel.app/admin/security`
- Verify you're logged in as admin

### 2. Sort alerts by severity
- **Critical** → act within 1 hour
- **High** → act within 4 hours
- **Medium** → review same day
- **Low** → batch review weekly

### 3. For each alert, answer:
- Is this a real user or a bot? (check `users.created_at`, `users.trust_score`)
- Is money at risk? (check `payments` for the `job_id`)
- Is the user a repeat offender? (check `user_fraud_scores.detection_count`)

## Response Actions

Use `POST /api/admin/fraud/actions` with one of these actions:

### `warn` — first offense, low severity
- Sends an in-app notification to the user
- Sets the fraud alert status to `warned`
- Does NOT restrict the account
- Use when: user shared a phone number in chat (first time)

### `suspend` — repeated or medium severity
- Sets `users.status = 'disabled'`
- Revokes all active refresh tokens (forces logout)
- Sets `fundis.approval_status = 'suspended'` if a fundi
- Trust score -30
- Use when: user repeatedly tries to bypass payment, or a fundi has 3+ fraud alerts

### `ban` — critical severity, confirmed fraud
- Same as suspend but permanent
- Use when: confirmed scam, fake ID, or identity theft

### `resolve` — false positive
- Marks the alert as resolved
- No action taken against the user
- Use when: alert was a false positive (e.g. phone number was a delivery address)

### `invoice` — commission debt
- Creates an invoice for outstanding commission
- Sends notification to the fundi
- Use when: fundi completed a job but payment was reversed/never received

## Escalation Matrix

| Scenario | Action |
|---|---|
| Off-platform payment request (first) | `warn` |
| Off-platform payment request (second) | `suspend` |
| Off-platform payment request (third) | `ban` |
| Fake ID detected | `ban` immediately + report to authorities |
| Duplicate selfie across accounts | `ban` both accounts |
| Job completed but no payment | `invoice` + `suspend` if not paid in 7 days |
| Chargeback from M-Pesa | `suspend` fundi, investigate, `ban` if confirmed |
| Customer reports being scammed | `suspend` accused party pending investigation |

## Customer Refund Process

If a customer was scammed and money is in escrow:

1. Verify the complaint via `GET /api/jobs/:jobId` and chat history
2. If valid: `POST /api/admin/escrow/:jobId/freeze` (prevents payout)
3. Issue refund via M-Pesa reversal (manual via Daraja portal)
4. Mark in DB:
   ```sql
   update payments set escrow_status = 'refunded', updated_at = now() where job_id = '<job-id>';
   update jobs set escrow_status = 'refunded', payment_status = 'failed' where id = '<job-id>';
   ```
5. `ban` the offending fundi
6. `resolve` the fraud alert with note "Refunded KES X to customer"

## Reporting

### Weekly fraud report
Every Monday, run:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://patafundi-9bhsw1.onrender.com/api/admin/fraud/reports?period=7d
```
Log the totals in the ops journal:
- Fraud attempts
- Accounts suspended
- Accounts banned
- Commission recovered
- Outstanding debts

### Monthly compliance report
For Kenyan regulatory compliance, export:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://patafundi-9bhsw1.onrender.com/api/admin/fraud/reports?period=30d&format=csv
```
Store in the compliance folder for 7 years.

## Prevention

- Fraud pattern detection runs every 15 min automatically
- Trust score adjusts automatically based on behavior
- OTP lockout after 5 failed attempts (15 min)
- Job completion OTP prevents fundi from self-confirming
- Commission debt auto-deducted from future payouts
