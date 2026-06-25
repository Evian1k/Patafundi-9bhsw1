# PATAFUNDI STAFF ROLES IMPLEMENTATION

**Date:** 2026-06-22
**Status:** ✅ Complete — 8 roles, 66 permissions, 7 dashboards, advisory-only AI

---

## ROLE-PERMISSION MATRIX (Synced to Spec)

| Role | Permissions | Dashboards Accessible |
|------|-------------|----------------------|
| **super_admin** | 66 (everything) | All dashboards |
| **ops_manager** | 18 | Operations, Dispatch, Fundis, Jobs, Users, Support, Disputes |
| **support_agent** | 10 | Support Dashboard, Disputes, Tickets, Users, Fundis |
| **fraud_analyst** | 12 | Fraud Dashboard, Fraud Alerts, Users, Fundis, Referral Analytics |
| **finance_team** | 11 | Finance Dashboard, Payments, Revenue, Referral Campaigns |
| **dispatch_team** | 7 | Dispatch Dashboard, Live Operations, Fundis, Jobs |
| **devops_engineer** | 9 | DevOps Dashboard, System Health, Audit Logs, System Settings |
| **auditor** | 26 (read-only) | All view-only dashboards, Audit Logs |

---

## NEW DASHBOARDS CREATED

| Dashboard | Route | Access | Purpose |
|-----------|-------|--------|---------|
| **Growth Dashboard** | `/staff/growth` | super_admin | User growth, job growth, revenue trends, retention |
| **Finance Dashboard** | `/staff/finance/dashboard` | super_admin, finance_team | Revenue today, escrow balance, pending payouts, refund requests |
| **Fraud Dashboard** | `/staff/fraud/dashboard` | super_admin, fraud_analyst | Suspicious accounts, payments, referral abuse, multiple accounts |
| **Dispatch Dashboard** | `/staff/dispatch/dashboard` | super_admin, ops_manager, dispatch_team | Active jobs, available/busy fundis, live map |
| **Support Dashboard** | `/staff/support/dashboard` | super_admin, ops_manager, support_agent | Open/resolved/escalated tickets, SLA breaches |
| **DevOps Dashboard** | `/staff/devops/dashboard` | super_admin, devops_engineer | CPU, RAM, DB status, API latency, uptime |
| **Loyalty Campaigns** | `/staff/loyalty` | super_admin | Loyalty tiers, point multipliers, enable/disable program |

---

## AI COMMAND CENTER (Advisory Only)

The AI **NEVER** executes actions. It only generates recommendations that super_admin must approve or reject.

### What AI Can Do:
- ✅ Detect fraud
- ✅ Detect suspicious fundis
- ✅ Detect revenue anomalies
- ✅ Detect refund abuse
- ✅ Detect referral abuse
- ✅ Suggest commission changes
- ✅ Suggest staff actions
- ✅ Generate reports

### What AI Cannot Do:
- ❌ Approve fundis
- ❌ Pay money
- ❌ Ban users automatically
- ❌ Change commissions
- ❌ Change settings
- ❌ Delete records
- ❌ Transfer money
- ❌ Issue refunds

### Workflow:
1. AI generates recommendation → stored in `ai_recommendations` table
2. Super admin sees recommendation in `/staff/ai`
3. Super admin clicks **Approve** or **Reject**
4. Backend marks recommendation as `actioned` or `dismissed`
5. All actions logged in `audit_logs` with `ai.review_*` action type

### API Endpoints:
- `GET /api/ai/dashboard` — AI overview with recent recommendations
- `POST /api/ai/run` — trigger AI analysis (super_admin only)
- `GET /api/ai/recommendations` — list with filters
- `POST /api/ai/recommendations/:id/review` — approve/reject (super_admin only)
  - Body: `{ action: "approve" | "reject" | "reviewed", note?: string }`
  - `approve` → status = `actioned` (super_admin will act on it)
  - `reject` → status = `dismissed`
  - `reviewed` → noted but no decision yet

---

## NEW BACKEND ENDPOINTS

### Staff Management (super_admin only)
| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `POST` | `/api/admin/staff` | `can_create_staff` | Create new staff account |
| `POST` | `/api/admin/staff/:id/suspend` | `can_suspend_staff` | Suspend staff account |
| `POST` | `/api/admin/staff/:id/reinstate` | `can_suspend_staff` | Reinstate suspended staff |
| `POST` | `/api/admin/users/:id/ban` | `can_ban_permanently` | Permanently ban user |
| `POST` | `/api/admin/users/:id/role` | `can_promote_users` | Change user's role |
| `POST` | `/api/admin/users/:id/permissions` | `can_manage_roles` | Grant/revoke permission |
| `GET` | `/api/admin/roles` | `can_manage_roles` | List all roles |
| `GET` | `/api/admin/roles/:role/permissions` | `can_manage_roles` | List role's permissions |

### Security Guards
- **super_admin role cannot be assigned via API** — only via direct DB access
- **super_admin accounts cannot be suspended or banned** via API
- All staff mutations revoke active sessions (force re-login)
- All actions logged in `audit_logs` table

---

## DATABASE CHANGES

### Migration 018: Staff Role Permission Sync

**New permissions added (31):**
- Staff management: `can_create_staff`, `can_suspend_staff`, `can_change_staff_permissions`
- User management: `can_ban_permanently`, `can_review_high_risk_fundis`
- System: `can_view_audit_trails`, `can_configure_apis`, `can_activate_promotions`
- Programs: `can_enable_disable_referrals`, `can_enable_disable_loyalty`
- Dashboards: `can_view_executive_dashboard`, `can_view_growth_dashboard`, `can_view_loyalty_campaigns`, `can_view_finance_dashboard`, `can_view_dispatch_dashboard`, `can_view_support_dashboard`, `can_view_devops_dashboard`, `can_view_ai_command_center`, `can_view_platform_health`, `can_view_api_status`
- Operations: `can_reassign_jobs`, `can_contact_users`, `can_export_reports`, `can_reconcile_payments`, `can_restart_services`, `can_view_deployments`, `can_monitor_uptime`, `can_freeze_accounts`, `can_escalate_fraud`
- AI workflow: `can_approve_ai_recommendation`, `can_reject_ai_recommendation`

**Role permissions reset and re-granted per exact spec.**

---

## NAVIGATION (Role-Aware)

The staff sidebar now shows different items based on role:

### Super Admin sees:
- Operations: Overview, Live Ops, Dispatch, Fundis, Jobs, Users
- Finance: Finance Dashboard, Payments, Revenue, Commission, Referrals, Loyalty
- Trust & Safety: Fraud Dashboard, Fraud Alerts, Support, Disputes
- Administration: Executive, Growth, AI Command Center, Staff Mgmt, Security, System Settings
- System: DevOps, Audit Logs, System Health

### Ops Manager sees:
- Operations: Overview, Live Ops, Dispatch, Fundis, Jobs, Users
- Trust & Safety: Support Dashboard, Disputes

### Support Agent sees:
- Operations: Live Ops, Fundis, Jobs, Users
- Trust & Safety: Support Dashboard, Disputes

### Fraud Analyst sees:
- Operations: Fundis, Jobs, Users
- Finance: Referral Campaigns
- Trust & Safety: Fraud Dashboard, Fraud Alerts

### Finance Team sees:
- Finance: Finance Dashboard, Payments, Revenue, Referral Campaigns

### Dispatch Team sees:
- Operations: Live Ops, Dispatch, Fundis, Jobs

### DevOps Engineer sees:
- Administration: Security Center, System Settings
- System: DevOps Dashboard, Audit Logs, System Health

### Auditor sees:
- All view-only dashboards
- Audit Logs
- System Health

---

## FILES CHANGED

| File | Change |
|------|--------|
| `backend/migrations/018_staff_role_permissions_sync.sql` | NEW — 31 permissions + role sync |
| `backend/src/controllers/rbacController.js` | Added `createStaff`, `suspendStaff`, `reinstateStaff`, `banUserPermanently` |
| `backend/src/controllers/aiController.js` | Added `approve`/`reject` action aliases |
| `backend/src/routes.js` | Added 4 staff management routes |
| `src/pages/staff/GrowthDashboard.tsx` | NEW — Growth analytics |
| `src/pages/staff/FinanceDashboard.tsx` | NEW — Finance overview |
| `src/pages/staff/FraudDashboard.tsx` | NEW — Fraud monitoring |
| `src/pages/staff/DispatchDashboard.tsx` | NEW — Live dispatch map |
| `src/pages/staff/SupportDashboard.tsx` | NEW — Support tickets |
| `src/pages/staff/DevOpsDashboard.tsx` | NEW — Infrastructure health |
| `src/pages/staff/LoyaltyCampaigns.tsx` | NEW — Loyalty program management |
| `src/components/staff/StaffLayout.tsx` | Updated navigation to be role-aware per spec |
| `src/routes/AppRoutes.tsx` | Added 7 new dashboard routes |
| `src/lib/api.ts` | Added 12 new API client methods (staff mgmt + AI) |

---

## RECOMMENDED TEAM STRUCTURE

Per your spec, for the first 10,000 users:

| Role | Count | Purpose |
|------|-------|---------|
| Super Admin | 1 | Platform owner (you) |
| Ops Manager | 2 | Operations department |
| Support Agent | 3 | Customer service |
| Fraud Analyst | 1 | Trust & Safety |
| Finance Officer | 1 | Accounting |
| Dispatch Officer | 2 | Marketplace operations |
| DevOps Engineer | 1 | Infrastructure |
| Auditor | 1 | Compliance |
| **Total** | **12** | |

This structure mirrors Uber, Bolt, and large service marketplaces — separating responsibilities and permissions to prevent abuse and ensure accountability.

---

## VERIFICATION

- ✅ TypeScript compiles
- ✅ Frontend build succeeds (8.53s)
- ✅ Migration 018 applied to Neon DB
- ✅ All 8 roles have correct permissions
- ✅ super_admin has 66 permissions (everything)
- ✅ auditor has 26 permissions (read-only)
- ✅ Navigation is role-aware
- ✅ AI Command Center is advisory-only
- ✅ Staff management endpoints have proper RBAC guards
- ✅ super_admin cannot be created/suspended/banned via API

---

*Implementation complete. All 8 staff roles are now operational with exact permissions per spec, role-specific dashboards, and an advisory-only AI Command Center.*
