# PataFundi — Company Ecosystem

The company partner system makes professional companies first-class marketplace
participants — not a bolt-on. This document describes the end-to-end lifecycle
as implemented in this codebase.

---

## 1. Lifecycle

```
PARTNER APPLICATION (public /partner-program)
   POST /api/company/applications            status: submitted
→ REVIEW (staff/admin)
   GET  /api/admin/company-applications
   POST /api/admin/company-applications/:id/review
   statuses: submitted → reviewing → more_info_required → approved | rejected | suspended
→ APPROVAL PROVISIONS THE COMPANY (single transaction)
   company_profiles row (status: approved)
   + owner membership in company_members
   + applicant user promoted to role company_admin
→ ONBOARDING (company portal /company)
   profile · services · service areas · branches · guarantees · availability
→ TEAM (invite technicians with temporary passwords; roles: manager, admin,
   dispatcher, finance, technician)
→ SERVICE DELIVERY (jobs + dispatch, below)
→ CUSTOMER CONFIRMATION (OTP)
→ SETTLEMENT (server-computed, gross − platform commission = net)
→ PERFORMANCE (ratings, reviews, completed-job counters)
→ SUPPORT / SUSPENSION / REACTIVATION (admin actions, audited)
```

Application statuses supported by the DB CHECK:
`draft, submitted, reviewing, more_info_required, approved, rejected, suspended, archived`.

**The frontend can never approve a company.** All lifecycle transitions are
`requireRole('admin')` + audit-logged.

## 2. Jobs & dispatch

```
CUSTOMER REQUEST (books a specific company, or posts to the open company pool)
   POST /api/jobs  { companyId } | { providerType: 'company' }
   → job.provider_type='company', status pending|matching
→ COMPANY RECEIVES JOB (dispatch board: Incoming + Open pool tabs)
→ COMPANY ACCEPTS   POST /company/jobs/:id/accept     status: accepted
   (or rejects → back to matching pool)
→ QUOTE (optional, for inspection/complex jobs)
   POST /company/jobs/:id/quote  → status: offered
   customer approves/rejects: POST /jobs/:id/quote/decision
→ DISPATCH
   POST /company/jobs/:id/assign-technician { technicianMemberId }
   → technician must be an ACTIVE member of THE SAME company
   → status: assigned, assigned_by recorded, technician + customer notified (DB + realtime)
→ TECHNICIAN EXECUTES (/technician app)
   assigned → on_the_way → arrived → in_progress → complete (+OTP)
→ CUSTOMER CONFIRMS (OTP) → ESCROW RELEASES → COMPANY SETTLEMENT (pending)
→ ADMIN PAYOUT (settlements marked paid) → REVIEWS
```

Job status CHECK (migration 033): `pending, matching, offered, accepted,
assigned, scheduled, on_the_way, arrived, in_progress, completion_requested,
completed, cancelled, failed` — enforced by a state-machine map in
`jobController.patchJob` (invalid jumps → 400).

## 3. Isolation model

Every `/company/*` endpoint runs `requireCompanyMember`:
- resolves the caller's `company_members` row for the target company on every request
- rejects non-members (403) and suspended members
- role-gates: dispatch actions, finance visibility, profile/team writes
- platform-staff bypass limited to `super_admin`/`admin` (audited surfaces)

Cross-company tests: `backend/src/company-partnership.test.js` + E2E §5.

## 4. Finance

- Settlements table (`company_settlements`): gross, commission (15% default,
  category-configurable), net, status `pending → processing → paid`.
- Written atomically by `settlementService.releaseJobEscrow` at customer
  confirmation (or admin manual release).
- Company finance view (owner/finance roles only): earnings summary, settlement
  history, monthly aggregation. **Customers never see commission; the public
  directory exposes no financial internals.**
- Refund path voids pending settlements and debits any credited wallet.

## 5. Portal sections → implementation map

| Spec section | Backend | Frontend |
|---|---|---|
| DASHBOARD | `GET /company/portal/overview` | `PortalDashboard.tsx` |
| MY BUSINESS / PROFILE | `GET|PUT /company/portal/profile` | `PortalSettings.tsx` |
| SERVICES | `/company/portal/services` CRUD | `PortalServices.tsx` |
| TEAM (technicians, roles) | `/company/portal/team` CRUD | `PortalTeam.tsx` |
| OPERATIONS (jobs) | `/company/portal/jobs?scope=…`, accept/reject/quote/assign | `PortalJobs.tsx` |
| SCHEDULE | `GET /company/portal/schedule` | `PortalSchedule.tsx` |
| QUALITY | `GET /company/portal/reviews` | `PortalQuality.tsx` |
| FINANCE | `GET /company/portal/finance` | `PortalFinance.tsx` |
| TECHNICIAN EXPERIENCE | `GET /company/technician/assignments`, status updates | `TechnicianApp.tsx` |
| APPLICATIONS (admin) | `/admin/company-applications`, `/admin/companies` | `CompanyApplications.tsx` |

## 6. Demo data

`backend/scripts/seed-takeover.js` provisions **Apex Home Services Ltd** with
branches, technicians, services, lifecycle jobs, settlements and reviews —
development-only, labelled DEMO. See `DEMO_ACCOUNTS.md`.
