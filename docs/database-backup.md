# Database Backup Checklist

## Render PostgreSQL (production)

### Enable automated backups
1. Render dashboard → `patafundi-db` → Settings
2. Upgrade to **Starter** plan ($7/mo) — required for backups on Render
3. Enable "Daily Backups" → retention 7 days
4. Verify: next backup scheduled within 24 hours

### Manual backup (before risky operations)
```bash
# Get the DATABASE_URL from Render's env vars
render db:export patafundi-db --output-file patafundi-$(date +%Y%m%d).dump
```
Or via `pg_dump`:
```bash
pg_dump "$DATABASE_URL" --format=custom --file=patafundi-$(date +%Y%m%d).dump
```

### Restore from backup
```bash
# Drop and recreate (DESTRUCTIVE — only on a fresh DB)
pg_restore --clean --if-exists --dbname="$DATABASE_URL" patafundi-YYYYMMDD.dump
```
For point-in-time recovery, contact Render support — they maintain WAL archives.

## What to back up

| Data | Criticality | Notes |
|---|---|---|
| `users` | Critical | Passwords are hashed; cannot be recovered without reset |
| `fundis` | Critical | Includes approval_status, verification scores |
| `jobs` | Critical | Transaction history |
| `payments` | Critical | Financial record — keep for 7 years (Kenyan law) |
| `escrow_transactions` | Critical | Financial record |
| `payouts` | Critical | Financial record |
| `verification_documents` (metadata) | Critical | R2 keys only; actual files in R2 |
| `audit_logs` | Critical | Tamper-evident (trigger prevents deletion) |
| `fraud_alerts` | High | Compliance evidence |
| `revenue_ledger` | High | Accounting |
| `otp_codes` | Low | TTL 10 min, can be regenerated |
| `refresh_tokens` | Low | Can be revoked |

## Cloudflare R2 (file storage)

R2 is automatically durable (11 nines). No additional backup needed for files,
but verify periodically:

```bash
# List recent uploads (should match DB rows)
aws s3 ls s3://patafundi/verification/ --recursive --human-readable | tail -20
```

## Verification Schedule

| Frequency | Action |
|---|---|
| Daily (automated) | Render PostgreSQL snapshot |
| Weekly | Manual: `pg_dump` to off-cloud storage (e.g. Backblaze B2) |
| Monthly | Restore test: spin up a temp DB, restore latest backup, run `db_integrity.mjs` |
| Quarterly | Review retention policy; adjust if data volume grows |

## Restore Test (Monthly)

1. Spin up a temporary Render PostgreSQL instance
2. Restore the latest backup
3. Run `node scripts/db_integrity.mjs` against the temp instance
4. Verify: 235+ columns OK, 72 FKs, 97 indexes
5. Spot-check: count users, jobs, payments — should match production
6. Tear down temp instance
7. Log the test result in the ops journal

If the restore test fails, treat as SEV-2 — backups are useless if they can't be restored.
