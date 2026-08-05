# Test plan — error-handling PR #2

Env: backend `node backend/src/server.js` (PATAFUNDI_EMBEDDED_DB=1, port 4000), vite :8080 proxying /api.
Staff login: admin@patafundi.com / Admin@2024! (super_admin → /staff/executive). Customer: demo@patafundi.com / Demo@2024!.
Code refs: src/components/staff/DashboardLoadError.tsx:13, StaffOverview.tsx load()/error, DispatchDashboard.tsx:20-40, Settings.tsx:58-67.

## T1 Happy path — staff dashboards render data, no banner
Logged in as super_admin, visit /staff/executive (overview), /staff/dispatch, /staff/finance, /staff/growth, /staff/support, /staff/devops.
PASS: each page renders stat cards; NO red "Could not load dashboard data" banner anywhere.

## T2 Failure path — banner instead of zeros
Kill backend process. Reload /staff/dispatch (and /staff/executive).
PASS: red banner with heading "Could not load dashboard data" plus a non-empty error message string is visible in a screenshot. Cards must NOT silently show clean zeros with no banner.
FAIL if page shows zeros with no banner (old behavior).

## T3 Retry works
With banner shown, restart backend, click "Retry" in the banner.
PASS: banner disappears and stat values render, without a page reload.

## T4 Settings toggle success persists
Log in as demo customer, /settings → Safety/Privacy section. Note a toggle's state, click it (backend healthy). Reload page.
PASS: toggle stays in the new position after reload (no snap-back, no error toast).

## T5 Settings toggle failure reverts + toast
Kill backend, click the same toggle.
PASS: toggle visibly returns to its prior position AND a sonner error toast appears (screenshot must show both).
FAIL if toggle stays flipped or no toast.

## Monitoring
Check browser console for unhandled rejections and /tmp/backend.log for new `[non-fatal]` lines after the run.
