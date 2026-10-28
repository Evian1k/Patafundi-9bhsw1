# PataFundi Operational Playbooks

This directory contains runbooks for production operations. Each playbook is
a step-by-step checklist — no decisions to make in the moment, just execute.

## Playbooks

| Playbook | When to use |
|---|---|
| [Launch Checklist](./launch-checklist.md) | Before opening the platform to real users |
| [Incident Recovery](./incident-recovery.md) | When the platform is down or degraded |
| [Database Backup](./database-backup.md) | Daily / weekly backup verification |
| [Fraud Response](./fraud-response.md) | When a fraud alert fires or a user reports being scammed |
| [Fundi Verification](./fundi-verification.md) | Daily review of pending fundi applications |

## Current engineering and deployment references

| Document | Purpose |
|---|---|
| [Architecture](./ARCHITECTURE.md) | Current components, data flows, and trust boundaries |
| [Container deployment](./CONTAINER_DEPLOYMENT.md) | Windows PowerShell Docker Compose runbook and verified status |
| [Kubernetes deployment](./KUBERNETES_DEPLOYMENT.md) | Kustomize overlays and local-cluster limitations |
| [Security audit](./SECURITY_AUDIT.md) | Dependency and application-security findings |
| [Database and migrations](./DATABASE_AND_MIGRATIONS.md) | Safe migration, test, backup, and restore guidance |
| [Production readiness](./PRODUCTION_READINESS.md) | Release blockers and evidence |

## Quick reference

| What | Where |
|---|---|
| Production API | https://patafundi-9bhsw1.onrender.com |
| Production frontend | https://patafundi-9bhsw1.vercel.app |
| Health check | `GET https://patafundi-9bhsw1.onrender.com/health` |
| Render dashboard | https://dashboard.render.com |
| Vercel dashboard | https://vercel.com/evian1k/patafundi-9bhsw1 |
| Cloudflare R2 dashboard | https://dash.cloudflare.com → R2 |
| Resend dashboard | https://resend.com/emails |
| Safaricom Daraja portal | https://developer.safaricom.co.ke |
| GitHub repo | https://github.com/Evian1k/Patafundi-9bhsw1 |
