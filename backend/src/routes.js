import express from 'express';
import { query } from './db.js';
import { authRequired, optionalAuth, requireRole } from './middleware/auth.js';
import { requireFundiAccount, requireApprovedFundi } from './middleware/fundiAccess.js';
import { requireApprovedWorker } from './middleware/workerAccess.js';
import { imageUpload } from './middleware/upload.js';
import * as auth from './controllers/authController.js';
import * as users from './controllers/userController.js';
import * as jobs from './controllers/jobController.js';
import * as payments from './controllers/paymentController.js';
import * as payouts from './controllers/payoutController.js';
import * as disputes from './controllers/disputeController.js';
import * as fundi from './controllers/fundiController.js';
import * as admin from './controllers/adminController.js';
import * as content from './controllers/contentController.js';
import * as chargebacks from './controllers/chargebackController.js';
import * as chat from './controllers/chatController.js';
import * as maps from './controllers/mapsController.js';
import * as fraud from './controllers/fraudController.js';
import * as storage from './controllers/storageController.js';
import * as verification from './controllers/verificationController.js';
import * as company from './controllers/companyController.js';
import * as aiAssistant from './controllers/aiAssistantController.js';
import * as refunds from './controllers/refundController.js';
import {
  requireAdminDocumentAccess,
  requireJobPhotoAccess,
  requireDisputeAccess,
  requireProfilePhotoAccess,
} from './middleware/storageAccess.js';
import { asyncHandler } from './utils/http.js';
import { aiRateLimit, supportRateLimit } from './middleware/rateLimit.js';
import { auditLog } from './services/auditService.js';

export const router = express.Router();

router.get('/health', (_req, res) => res.json({
  success: true,
  service: 'patafundi-api',
  build: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
  deployId: process.env.RENDER_DEPLOY_ID || null,
}));

// Public, honest platform statistics (spec §58: landing page shows REAL
// numbers — which are genuinely zero/small on a young platform).
router.get('/platform/stats', asyncHandler(async (_req, res) => {
  const result = await query(`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from fundis where approval_status = 'approved') as verified_fundis,
      (select count(*)::int from company_profiles where status = 'approved') as companies,
      (select count(*)::int from jobs where status = 'completed') as jobs_completed,
      (select coalesce(avg(rating), 0) from reviews) as average_rating
  `);
  const s = result.rows[0] || {};
  res.json({
    success: true,
    stats: {
      users: Number(s.users || 0),
      verifiedFundis: Number(s.verified_fundis || 0),
      companies: Number(s.companies || 0),
      jobsCompleted: Number(s.jobs_completed || 0),
      averageRating: Number(s.average_rating || 0),
    },
  });
}));

router.post('/auth/register', asyncHandler(auth.register));
router.post('/auth/register/fundi', imageUpload.any(), asyncHandler(auth.registerFundi));
router.post('/auth/login', asyncHandler(auth.login));
router.post('/auth/logout', asyncHandler(auth.logout));
router.post('/auth/refresh', asyncHandler(auth.refresh));
router.post('/auth/otp-verify', asyncHandler(auth.otpVerify));
router.post('/auth/otp-resend', asyncHandler(auth.otpResend));
router.post('/auth/forgot-password', asyncHandler(auth.forgotPassword));
router.post('/auth/reset-password', asyncHandler(auth.resetPassword));

router.get('/users/me', authRequired, asyncHandler(users.me));
router.put('/users/me', authRequired, asyncHandler(users.updateMe));
router.get('/users/settings', authRequired, asyncHandler(users.settings));
router.put('/users/settings', authRequired, asyncHandler(users.updateSettings));
router.get('/users/saved-places', authRequired, asyncHandler(users.savedPlaces));
router.post('/users/saved-places', authRequired, asyncHandler(users.addSavedPlace));
router.put('/users/saved-places/:id', authRequired, asyncHandler(users.updateSavedPlace));
router.delete('/users/saved-places/:id', authRequired, asyncHandler(users.deleteSavedPlace));
router.post('/users/change-password', authRequired, asyncHandler(users.changePassword));
router.post('/users/delete-account', authRequired, asyncHandler(users.deleteAccount));

// ── Public company directory (customer-safe, no auth needed to browse) ──
router.get('/companies', asyncHandler(company.publicCompanyDirectory));
router.get('/companies/:id', asyncHandler(company.publicCompanyProfileById));

// ── Company partner applications ──
router.post('/company/applications', authRequired, asyncHandler(company.createPartnerApplication));
router.get('/company/applications/me', authRequired, asyncHandler(company.listMyApplications));
router.post('/company/applications/:id/submit', authRequired, asyncHandler(company.submitPartnerApplication));
router.post('/company/applications/:id/review', authRequired, requireRole('admin'), asyncHandler(company.reviewPartnerApplication));
router.post('/company/applications/:id/approve', authRequired, requireRole('admin'), asyncHandler(company.approvePartnerApplication));
router.get('/admin/company-applications', authRequired, requireRole('admin'), asyncHandler(company.adminListApplications));
router.get('/admin/companies', authRequired, requireRole('admin'), asyncHandler(company.adminListCompanies));
router.get('/admin/companies/:id', authRequired, requireRole('admin'), asyncHandler(company.adminCompanyDetail));
router.post('/admin/companies/:id/action', authRequired, requireRole('admin'), asyncHandler(company.adminCompanyAction));

// ── Company portal (organization isolation enforced by requireCompanyMember) ──
router.get('/company/portal/overview', authRequired, company.portalAccess, asyncHandler(company.portalOverview));
router.get('/company/portal/profile', authRequired, company.portalAccess, asyncHandler(company.portalProfile));
router.put('/company/portal/profile', authRequired, company.portalAccess, asyncHandler(company.portalProfile));
router.get('/company/portal/services', authRequired, company.portalAccess, asyncHandler(company.portalServices));
router.post('/company/portal/services', authRequired, company.portalAccess, asyncHandler(company.portalCreateService));
router.patch('/company/portal/services/:serviceId', authRequired, company.portalAccess, asyncHandler(company.portalUpdateService));
router.delete('/company/portal/services/:serviceId', authRequired, company.portalAccess, asyncHandler(company.portalDeleteService));
router.get('/company/portal/team', authRequired, company.portalAccess, asyncHandler(company.portalTeam));
router.post('/company/portal/team', authRequired, company.portalAccess, asyncHandler(company.portalAddMember));
router.patch('/company/portal/team/:memberId', authRequired, company.portalAccess, asyncHandler(company.portalUpdateMember));
router.delete('/company/portal/team/:memberId', authRequired, company.portalAccess, asyncHandler(company.portalRemoveMember));
router.get('/company/portal/jobs', authRequired, company.portalAccess, asyncHandler(company.portalJobs));
router.get('/company/portal/open-pool', authRequired, company.portalAccess, asyncHandler(company.portalOpenPool));
router.post('/company/jobs/:jobId/claim', authRequired, company.portalAccess, asyncHandler(company.claimPoolJob));
router.post('/company/jobs/:jobId/accept', authRequired, company.portalAccess, asyncHandler(company.acceptCompanyJob));
router.post('/company/jobs/:jobId/reject', authRequired, company.portalAccess, asyncHandler(company.rejectCompanyJob));
router.post('/company/jobs/:jobId/quote', authRequired, company.portalAccess, asyncHandler(company.quoteCompanyJob));
router.post('/company/jobs/:jobId/assign-technician', authRequired, company.portalAccess, asyncHandler(company.assignTechnician));
router.post('/company/jobs/:jobId/unassign-technician', authRequired, company.portalAccess, asyncHandler(company.unassignTechnician));
router.get('/company/portal/schedule', authRequired, company.portalAccess, asyncHandler(company.portalSchedule));
router.get('/company/portal/reviews', authRequired, company.portalAccess, asyncHandler(company.portalReviews));
router.get('/company/portal/finance', authRequired, company.portalAccess, asyncHandler(company.portalFinance));
router.put('/company/portal/finance/payout-destination', authRequired, company.portalAccess, asyncHandler(company.portalUpdatePayoutDestination));
router.post('/company/portal/finance/withdraw', authRequired, company.portalAccess, asyncHandler(company.portalWithdraw));
// Lightweight membership probe (200 even for non-members — no 403 console noise)
router.get('/company/my-membership', authRequired, asyncHandler(company.myMembership));
router.get('/company/technician/assignments', authRequired, asyncHandler(company.technicianAssignments));

// Legacy secured overview (kept for compatibility)
router.get('/company/:companyId/overview', authRequired, asyncHandler(company.getCompanyPortalOverview));

router.post('/jobs', authRequired, asyncHandler(jobs.createJob));
router.post('/jobs/:id/quote/decision', authRequired, asyncHandler(jobs.decideQuote));
router.get('/properties', authRequired, asyncHandler(jobs.listProperties));
router.post('/properties', authRequired, asyncHandler(jobs.createProperty));
router.patch('/properties/:id', authRequired, asyncHandler(jobs.updateProperty));
router.delete('/properties/:id', authRequired, asyncHandler(jobs.deleteProperty));
router.get('/jobs', authRequired, asyncHandler(jobs.listJobs));
router.get('/jobs/fundi/active', authRequired, requireApprovedFundi, asyncHandler(jobs.activeFundiJob));
router.get('/jobs/:id', authRequired, asyncHandler(jobs.getJob));
router.post('/jobs/:id/photos', authRequired, imageUpload.array('photos', 10), asyncHandler(jobs.uploadJobPhotos));
router.patch('/jobs/:id', authRequired, asyncHandler(jobs.patchJob));
router.patch('/jobs/:id/status', authRequired, asyncHandler(jobs.updateStatus));
router.get('/jobs/:id/status', authRequired, asyncHandler(jobs.getJobStatus));
router.get('/jobs/:id/location', authRequired, asyncHandler(jobs.getJob));
router.post('/jobs/:id/accept', authRequired, requireApprovedFundi, asyncHandler(jobs.acceptJob));
router.post('/jobs/:id/decline', authRequired, requireApprovedFundi, asyncHandler(jobs.declineJob));
router.post('/jobs/:id/cancel', authRequired, asyncHandler(jobs.cancelJob));
router.post('/jobs/:id/check-in', authRequired, requireApprovedWorker, asyncHandler(jobs.checkIn));
router.post('/jobs/:id/complete', authRequired, requireApprovedWorker, imageUpload.array('photos', 8), asyncHandler(jobs.completeJob));
router.post('/jobs/:id/confirm-completion', authRequired, asyncHandler(jobs.confirmCompletion));
router.post('/jobs/:id/completion-code', authRequired, asyncHandler(jobs.resendCompletionCode));
router.post('/jobs/:id/review', authRequired, asyncHandler(jobs.submitReview));
router.post('/reviews', authRequired, asyncHandler(jobs.submitReview));
router.post('/reviews/:id/reply', authRequired, asyncHandler(jobs.replyToReview));

// ── AI Assistant (spec §31-32): real LLM features, advisory-only, rate-limited
router.post('/ai/analyze-job', authRequired, aiRateLimit, asyncHandler(aiAssistant.analyzeJob));
router.post('/ai/profile-improve', authRequired, aiRateLimit, asyncHandler(aiAssistant.improveProfile));
router.post('/ai/dispute-summary', authRequired, requireRole('admin'), aiRateLimit, asyncHandler(aiAssistant.summarizeDispute));
router.get('/ai/status', authRequired, asyncHandler(aiAssistant.aiStatus));

// ── Refund requests (spec §8/§23): customer request → admin decision
router.post('/jobs/:id/refund-request', authRequired, asyncHandler(refunds.createRefundRequest));
router.get('/refunds/mine', authRequired, asyncHandler(refunds.listMyRefundRequests));
router.get('/admin/refund-requests', authRequired, requireRole('admin'), asyncHandler(refunds.listRefundRequests));
router.post('/admin/refund-requests/:id/decision', authRequired, requireRole('admin'), asyncHandler(refunds.decideRefundRequest));

router.post('/payments/stk-push', authRequired, asyncHandler(payments.stkPush));
router.post('/payments/process/:jobId', authRequired, asyncHandler(payments.legacyProcess));
router.post('/payments/webhook', asyncHandler(payments.webhook));
router.post('/payments/daraja-callback', asyncHandler(payments.webhook));
// Spec §26-27: card payments via Stripe (env-gated) + finance reconciliation (spec §28).
router.post('/payments/stripe/intent', authRequired, asyncHandler(payments.stripeIntent));
router.post('/payments/stripe/webhook', asyncHandler(payments.stripeWebhook));
router.get('/admin/finance/reconciliation', authRequired, requireRole('admin'), asyncHandler(payments.financeReconciliation));
router.get('/payments/job/:jobId', authRequired, asyncHandler(payments.paymentForJob));
router.get('/payments/escrow/:jobId', authRequired, asyncHandler(payments.escrowForJob));
router.get('/payments/wallet/balance', authRequired, asyncHandler(payments.walletBalance));

router.post('/payouts/request', authRequired, requireApprovedFundi, asyncHandler(payouts.requestPayout));
router.post('/admin/refunds', authRequired, requireRole('admin'), asyncHandler(payouts.processRefund));
router.post('/fundi/wallet/withdraw-request', authRequired, requireApprovedFundi, asyncHandler(payouts.requestPayout));

router.post('/disputes', authRequired, asyncHandler(disputes.createDispute));
router.get('/disputes', authRequired, asyncHandler(disputes.listDisputes));
router.post('/disputes/:id/evidence', authRequired, imageUpload.array('evidence', 5), asyncHandler(disputes.uploadEvidence));

router.post('/fundi/register', authRequired, requireFundiAccount, imageUpload.any(), asyncHandler(fundi.registerFundi));
router.get('/fundi/onboarding-status', authRequired, requireFundiAccount, asyncHandler(fundi.onboardingStatus));
router.get('/fundi/profile', authRequired, requireFundiAccount, asyncHandler(fundi.profile));
router.put('/fundi/profile', authRequired, requireFundiAccount, asyncHandler(fundi.updateProfile));
router.get('/fundi/approval-status', authRequired, requireFundiAccount, asyncHandler(fundi.approvalStatus));
router.get('/fundi/search', asyncHandler(fundi.searchFundis));
router.get('/fundi/dashboard', authRequired, requireApprovedFundi, asyncHandler(fundi.dashboard));
router.get('/fundi/status', authRequired, requireApprovedFundi, asyncHandler(fundi.status));
router.post('/fundi/status/online', authRequired, requireApprovedFundi, asyncHandler(fundi.goOnline));
router.post('/fundi/status/offline', authRequired, requireApprovedFundi, asyncHandler(fundi.goOffline));
router.post('/fundi/location', authRequired, requireApprovedFundi, asyncHandler(fundi.location));
router.get('/fundi/wallet/transactions', authRequired, requireApprovedFundi, asyncHandler(fundi.walletTransactions));
router.get('/fundi/ratings', optionalAuth, asyncHandler(fundi.ratings));
router.get('/fundi/:id/reviews', asyncHandler(fundi.ratings));
router.get('/fundi/:id', asyncHandler(fundi.publicFundi));

router.get('/admin/dashboard', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/dashboard-stats', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/search-fundis', authRequired, requireRole('admin'), asyncHandler(admin.searchFundis));
router.get('/admin/fundis', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fundis', 'fundis')));
router.get('/admin/fundis/:id', authRequired, requireRole('admin'), asyncHandler(admin.getFundi));
router.post('/admin/fundis/:id/approve', authRequired, requireRole('admin'), asyncHandler(admin.approveFundi));
router.post('/admin/fundis/:id/reject', authRequired, requireRole('admin'), asyncHandler(admin.rejectFundi));
router.post('/admin/fundis/:id/request-reupload', authRequired, requireRole('admin'), asyncHandler(admin.requestFundiReupload));
router.post('/admin/fundis/:id/suspend', authRequired, requireRole('admin'), asyncHandler(admin.suspendFundi));
router.post('/admin/fundis/:id/financial-freeze', authRequired, requireRole('admin'), asyncHandler(admin.setFundiFinancialFreeze));
router.get('/admin/customers', authRequired, requireRole('admin'), asyncHandler(admin.listCustomers));
router.post('/admin/customers/:id/block', authRequired, requireRole('admin'), asyncHandler(admin.blockUser));
router.post('/admin/customers/:id/unblock', authRequired, requireRole('admin'), asyncHandler(admin.unblockUser));
router.get('/admin/jobs', authRequired, requireRole('admin'), asyncHandler(admin.listJobs));
router.get('/admin/payments', authRequired, requireRole('admin'), asyncHandler(admin.listTable('payments', 'payments')));
router.get('/admin/transactions', authRequired, requireRole('admin'), asyncHandler(admin.transactions));
router.get('/admin/escrow-queue', authRequired, requireRole('admin'), asyncHandler(admin.escrowQueue));
router.post('/admin/escrow/:jobId/release', authRequired, requireRole('admin'), asyncHandler(payouts.releaseEscrow));
router.post('/admin/escrow/:jobId/freeze', authRequired, requireRole('admin'), asyncHandler(payouts.freezeEscrow));
router.post('/admin/payouts/:id/complete', authRequired, requireRole('admin'), asyncHandler(payouts.completePayout));
router.get('/admin/payouts', authRequired, requireRole('admin'), asyncHandler(admin.listPayouts));
router.get('/admin/subscriptions', authRequired, requireRole('admin'), asyncHandler(admin.listSubscriptions));
router.get('/admin/reviews', authRequired, requireRole('admin'), asyncHandler(admin.listReviews));
router.post('/admin/reviews/:id/hide', authRequired, requireRole('admin'), asyncHandler(admin.hideReview));
router.post('/admin/fundis/:id/verification-level', authRequired, requireRole('admin'), asyncHandler(admin.setFundiVerificationLevel));
router.get('/admin/disputes', authRequired, requireRole('admin'), asyncHandler(disputes.listDisputes));
router.post('/admin/disputes/:id/resolve', authRequired, requireRole('admin'), asyncHandler(disputes.resolveDispute));
router.get('/admin/audit-logs', authRequired, requireRole('admin'), asyncHandler(admin.listTable('audit_logs', 'logs')));
router.get('/admin/reports', authRequired, requireRole('admin'), asyncHandler(admin.reports));
router.get('/admin/reports/analytics', authRequired, requireRole('admin'), asyncHandler(admin.reports));
router.get('/admin/revenue', authRequired, requireRole('admin'), asyncHandler(admin.revenueDashboard));
router.get('/admin/fraud/dashboard', authRequired, requireRole('admin'), asyncHandler(fraud.fraudDashboard));
router.get('/admin/fraud/alerts', authRequired, requireRole('admin'), asyncHandler(fraud.listFraudAlerts));
router.get('/admin/fraud/debts', authRequired, requireRole('admin'), asyncHandler(fraud.listCommissionDebts));
router.get('/admin/fraud/suspicious-jobs', authRequired, requireRole('admin'), asyncHandler(fraud.listSuspiciousJobs));
router.get('/admin/fraud/suspicious-users', authRequired, requireRole('admin'), asyncHandler(fraud.listSuspiciousUsers));
router.get('/admin/fraud/reports', authRequired, requireRole('admin'), asyncHandler(fraud.fraudReports));
router.get('/admin/fraud/users/:userId', authRequired, requireRole('admin'), asyncHandler(fraud.getUserFraudProfile));
router.get('/admin/fraud/jobs/:jobId/timeline', authRequired, requireRole('admin'), asyncHandler(fraud.getJobTimelineAdmin));
router.post('/admin/fraud/actions', authRequired, requireRole('admin'), asyncHandler(fraud.adminFraudAction));
router.get('/admin/security/overview', authRequired, requireRole('admin'), asyncHandler(admin.securityOverview));
router.get('/admin/security-alerts', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fraud_alerts', 'alerts')));
router.get('/admin/trust-scores', authRequired, requireRole('admin'), asyncHandler(admin.listTable('trust_scores', 'scores')));
router.get('/admin/bypass-alerts', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fraud_alerts', 'alerts')));
router.post('/admin/security-alerts/:id/resolve', authRequired, requireRole('admin'), asyncHandler(admin.resolveSecurityAlert));
router.post('/admin/users/:id/force-logout', authRequired, requireRole('admin'), asyncHandler(admin.forceLogout));
router.post('/admin/users/:id/disable', authRequired, requireRole('admin'), asyncHandler(admin.blockUser));
router.get('/admin/settings', authRequired, requireRole('admin'), asyncHandler(admin.getSettings));
router.put('/admin/settings', authRequired, requireRole('admin'), asyncHandler(admin.updateSettings));

// ============================================================
// Enterprise RBAC — permission-scoped staff endpoints
// ============================================================
import { requirePermission, requireAnyPermission, requireStaff } from './middleware/rbac.js';
import * as rbac from './controllers/rbacController.js';

// Any staff member can list their own permissions (for frontend UI gating).
router.get('/staff/me/permissions', authRequired, asyncHandler(rbac.listMyPermissions));

// Super-admin only: list all roles + permissions + assign/revoke.
router.get('/admin/roles', authRequired, requirePermission('can_manage_roles'), asyncHandler(rbac.listRoles));
router.get('/admin/roles/:role/permissions', authRequired, requirePermission('can_manage_roles'), asyncHandler(rbac.listRolePermissions));
router.post('/admin/users/:id/permissions', authRequired, requirePermission('can_manage_roles'), asyncHandler(rbac.setUserPermission));
router.delete('/admin/users/:id/permissions/:code', authRequired, requirePermission('can_manage_roles'), asyncHandler(rbac.removeUserPermission));
router.post('/admin/users/:id/role', authRequired, requirePermission('can_promote_users'), asyncHandler(rbac.setUserRole));

// Staff management (super_admin only)
router.post('/admin/staff', authRequired, requirePermission('can_create_staff'), asyncHandler(rbac.createStaff));
router.post('/admin/staff/:id/suspend', authRequired, requirePermission('can_suspend_staff'), asyncHandler(rbac.suspendStaff));
router.post('/admin/staff/:id/reinstate', authRequired, requirePermission('can_suspend_staff'), asyncHandler(rbac.reinstateStaff));
router.post('/admin/users/:id/ban', authRequired, requirePermission('can_ban_permanently'), asyncHandler(rbac.banUserPermanently));

// Permission-scoped admin routes (in addition to the existing requireRole('admin') ones above).
// These allow non-admin staff (support_agent, fraud_analyst, finance_team, etc.)
// to access specific endpoints without full admin access.
router.get('/staff/fraud/dashboard', authRequired, requirePermission('can_view_fraud_dashboard'), asyncHandler(fraud.fraudDashboard));
router.get('/staff/fraud/alerts', authRequired, requirePermission('can_view_fraud_dashboard'), asyncHandler(fraud.listFraudAlerts));
router.post('/staff/fraud/actions', authRequired, requirePermission('can_resolve_alerts'), asyncHandler(fraud.adminFraudAction));

router.get('/staff/disputes', authRequired, requirePermission('can_view_disputes'), asyncHandler(disputes.listDisputes));
router.post('/staff/disputes/:id/resolve', authRequired, requirePermission('can_resolve_disputes'), asyncHandler(disputes.resolveDispute));

router.get('/staff/payments', authRequired, requirePermission('can_view_payments'), asyncHandler(admin.listTable('payments', 'payments')));
router.get('/staff/revenue', authRequired, requirePermission('can_view_revenue'), asyncHandler(admin.revenueDashboard));
router.post('/staff/escrow/:jobId/release', authRequired, requirePermission('can_release_escrow'), asyncHandler(payouts.releaseEscrow));
router.post('/staff/payouts/:id/complete', authRequired, requirePermission('can_complete_payouts'), asyncHandler(payouts.completePayout));

router.get('/staff/jobs', authRequired, requirePermission('can_view_all_jobs'), asyncHandler(admin.listJobs));

// Extended health for the DevOps staff console (previously a dead 404 call).
router.get('/health/extended', authRequired, requirePermission('can_view_health'), asyncHandler(async (_req, res) => {
  const db = await query('select now() as db_time');
  const mem = process.memoryUsage();
  res.json({
    success: true,
    db: { ok: true, time: db.rows[0]?.db_time || null },
    node: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1048576),
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
    },
  });
}));
router.get('/staff/fundis', authRequired, requirePermission('can_view_fundis'), asyncHandler(admin.listTable('fundis', 'fundis')));
router.post('/staff/fundis/:id/approve', authRequired, requirePermission('can_approve_fundis'), asyncHandler(admin.approveFundi));
router.post('/staff/fundis/:id/suspend', authRequired, requirePermission('can_suspend_fundis'), asyncHandler(admin.suspendFundi));

router.get('/staff/audit-logs', authRequired, requirePermission('can_view_logs'), asyncHandler(admin.listTable('audit_logs', 'logs')));

// Error logs — staff with can_view_logs can view system errors.
// Supports filtering by reference code (users quote e.g. ERR-7F3K2Q to
// support), error type, and resolved state.
router.get('/staff/error-logs', authRequired, requirePermission('can_view_logs'), asyncHandler(async (req, res) => {
  const { query: q } = await import('./db.js');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const resolved = req.query.resolved === 'true' ? 'true' : (req.query.resolved === 'false' ? 'false' : null);
  const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null;
  const reference = typeof req.query.reference === 'string' && req.query.reference.trim() ? req.query.reference.trim().toUpperCase() : null;

  const conditions = [];
  const params = [];
  if (resolved) { params.push(resolved); conditions.push(`resolved = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`error_type = $${params.length}`); }
  if (reference) { params.push(reference); conditions.push(`upper(reference) = $${params.length}`); }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  params.push(limit);
  const result = await q(`select * from error_logs ${where} order by created_at desc limit $${params.length}`, params);
  res.json({ success: true, errors: result.rows });
}));

// Resolve error — mark as resolved
router.post('/staff/error-logs/:id/resolve', authRequired, requirePermission('can_view_logs'), asyncHandler(async (req, res) => {
  const { query: q } = await import('./db.js');
  await q('update error_logs set resolved = true, resolved_by = $2, resolved_at = now() where id = $1', [req.params.id, req.user.id]);
  res.json({ success: true, message: 'Error marked as resolved' });
}));

// ── Client error intake (public) ─────────────────────────────────────
// Frontend ErrorBoundary reports render crashes here. Users never see the
// technical detail — it lands in error_logs (source='client') and pings the
// DevOps team. Input is strictly size-limited; no auth required because
// crashes can happen pre-login.
router.post('/client-errors', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'Unknown client error';
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null;
  const page = typeof body.page === 'string' ? body.page.slice(0, 300) : null;

  // Reference is generated up-front so the UI can show it immediately —
  // the user can quote it to support while staff investigate.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  const reference = `ERR-${code}`;

  // Respond immediately — reporting must never block or break the UI further.
  setImmediate(() => {
    import('./services/errorNotificationService.js')
      .then(({ logErrorAndNotifyStaff }) => logErrorAndNotifyStaff({
        type: 'client',
        statusCode: 500,
        message: `[frontend] ${message}`,
        stack,
        reference,
        path: page,
        method: 'RENDER',
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        source: 'client',
      }))
      .catch(() => {});
  });

  res.status(202).json({ success: true, message: 'Error report received', reference });
}));

// Permission-based dashboard access (alternative to /admin/dashboard which requires 'admin' role)
router.get('/staff/dashboard', authRequired, requirePermission('can_view_metrics'), asyncHandler(admin.dashboard));
router.get('/staff/reports/analytics', authRequired, requirePermission('can_view_metrics'), asyncHandler(admin.reports));
router.get('/staff/support/tickets', authRequired, requirePermission('can_view_tickets'), asyncHandler(content.listSupportTickets));

// ============================================================
// AI Command Center — SUPER_ADMIN ONLY
// The AI NEVER performs actions. It only analyzes and recommends.
// All actions require super_admin approval via existing admin endpoints.
// ============================================================
import * as ai from './controllers/aiController.js';

router.get('/ai/dashboard', authRequired, requireRole('admin'), asyncHandler(ai.aiDashboard));
router.post('/ai/run', authRequired, requireRole('admin'), asyncHandler(ai.runAnalysis));
router.get('/ai/recommendations', authRequired, requireRole('admin'), asyncHandler(ai.listRecommendations));
router.post('/ai/recommendations/:id/review', authRequired, requireRole('admin'), asyncHandler(ai.reviewRecommendation));
router.get('/ai/insights/:category', authRequired, requireRole('admin'), asyncHandler(ai.getCategoryInsights));

// ============================================================
// Enterprise Systems — Phase 3-9 features
// ============================================================
import * as enterprise from './controllers/enterpriseController.js';
import * as ent2 from './controllers/enterpriseController2.js';
import { requirePermission as requirePerm } from './middleware/rbac.js';

// Quality scores (Phase 4)
// Fundi quality score is internal operational data (spec §7): readable by the
// fundi themself and by staff with fundi visibility — not by arbitrary callers.
router.get('/fundi/:fundiId/quality', authRequired, asyncHandler(async (req, res) => {
  let isSelf = false;
  if (req.user.role === 'fundi') {
    const own = await query('select 1 from fundis where id = $1 and user_id = $2', [req.params.fundiId, req.user.id]);
    isSelf = Boolean(own.rows[0]);
  }
  if (!isSelf) {
    const { requireAnyPermission } = await import('./middleware/rbac.js');
    await new Promise((resolve, reject) => {
      requireAnyPermission('can_view_fundis')(req, res, (err) => (err ? reject(err) : resolve()));
    });
  }
  await enterprise.getFundiQuality(req, res);
}));
router.post('/admin/quality/recalculate', authRequired, requireRole('admin'), asyncHandler(enterprise.recalculateQuality));
router.post('/admin/quality/:fundiId/calculate', authRequired, requireRole('admin'), asyncHandler(enterprise.calculateFundiQuality));

// Internal notes (Phase 7) — staff only
router.post('/staff/notes', authRequired, requirePerm('can_view_users'), asyncHandler(enterprise.createNote));
router.get('/staff/notes/:entityType/:entityId', authRequired, requirePerm('can_view_users'), asyncHandler(enterprise.listNotes));
router.delete('/staff/notes/:id', authRequired, requirePerm('can_view_users'), asyncHandler(enterprise.deleteNote));

// Escalations (Phase 6)
router.post('/staff/escalations', authRequired, requireStaff(), asyncHandler(enterprise.createEscalationReq));
router.post('/staff/escalations/:id/resolve', authRequired, requireStaff(), asyncHandler(enterprise.resolveEscalationReq));
router.get('/staff/escalations', authRequired, requireStaff(), asyncHandler(enterprise.listEscalationsReq));

// SLA (Phase 6)
router.get('/staff/sla/breaches', authRequired, requirePerm('can_view_logs'), asyncHandler(enterprise.getSlaBreachesReq));

// Commission control (Phase 3) — super_admin only
router.get('/admin/commission/history', authRequired, requirePerm('can_manage_system'), asyncHandler(enterprise.getCommissionHistoryReq));
router.put('/admin/commission/rate', authRequired, requirePerm('can_manage_system'), asyncHandler(enterprise.updateCommissionRate));
router.post('/admin/commission/simulate', authRequired, requireRole('admin'), asyncHandler(enterprise.simulateCommission));

// Staff management (Phase 2) — list all users with role filter
router.get('/admin/staff', authRequired, requirePerm('can_manage_roles'), asyncHandler(async (req, res) => {
  const { query: q } = await import('./db.js');
  const role = req.query.role;
  const staffRoles = ['super_admin', 'admin', 'support_agent', 'fraud_analyst', 'finance_team', 'dispatch_team', 'devops_engineer', 'auditor'];
  const params = [];
  let where = `where role = any($1)`;
  params.push(staffRoles);
  if (role) {
    params.push(role);
    where += ` and role = $2`;
  }
  const result = await q(
    `select id, email, full_name, phone, role, status, trust_score, created_at, updated_at
     from users ${where}
     order by created_at desc limit 100`,
    params,
  );
  res.json({ success: true, staff: result.rows });
}));

// ============================================================
// Fundi Enhancements — portfolio, SOS, availability, earnings
// ============================================================
import * as fundiEnh from './controllers/fundiEnhancementController.js';

// Portfolio (public view + fundi upload)
router.get('/fundi/:fundiId/portfolio', asyncHandler(fundiEnh.listPortfolio));
router.post('/fundi/portfolio/upload', authRequired, requireFundiAccount, imageUpload.single('image'), asyncHandler(fundiEnh.uploadPortfolioItem));
router.delete('/fundi/portfolio/:id', authRequired, requireFundiAccount, asyncHandler(fundiEnh.deletePortfolioItem));

// SOS Emergency
router.post('/sos/trigger', authRequired, asyncHandler(fundiEnh.triggerSOS));
router.get('/admin/sos', authRequired, requireRole('admin'), asyncHandler(fundiEnh.listSOS));
router.post('/admin/sos/:id/resolve', authRequired, requireRole('admin'), asyncHandler(fundiEnh.resolveSOS));

// Availability schedule
router.get('/fundi/availability', authRequired, requireFundiAccount, asyncHandler(fundiEnh.getAvailability));
router.put('/fundi/availability', authRequired, requireFundiAccount, asyncHandler(fundiEnh.updateAvailability));

// Earnings analytics
router.get('/fundi/earnings/analytics', authRequired, requireApprovedFundi, asyncHandler(fundiEnh.earningsAnalytics));

// ============================================================
// Security Center — 2FA, feature flags, sessions, favorites, API integrations
// ============================================================
import * as security from './controllers/securityController.js';

// 2FA (any authenticated user can set up their own)
router.post('/security/2fa/setup', authRequired, asyncHandler(security.setup2FAReq));
router.post('/security/2fa/verify', authRequired, asyncHandler(security.verify2FASetupReq));
router.post('/security/2fa/disable', authRequired, asyncHandler(security.disable2FAReq));
router.post('/security/2fa/regenerate-recovery', authRequired, asyncHandler(security.regenerateRecoveryReq));

// Feature flags (admin only)
router.get('/admin/feature-flags', authRequired, requireRole('admin'), asyncHandler(security.listFeatureFlags));
router.put('/admin/feature-flags', authRequired, requirePerm('can_manage_system'), asyncHandler(security.toggleFeatureFlag));

// Scheduled maintenance (Wednesday window)
router.get('/admin/maintenance/schedule', authRequired, requireRole('admin'), asyncHandler(async (req, res) => {
  const { getMaintenanceSchedule, isInMaintenanceWindow } = await import('./services/scheduledMaintenanceService.js');
  const schedule = await getMaintenanceSchedule();
  res.json({ success: true, schedule, currentlyInWindow: isInMaintenanceWindow(schedule) });
}));
router.put('/admin/maintenance/schedule', authRequired, requirePerm('can_manage_system'), asyncHandler(async (req, res) => {
  const { setMaintenanceSchedule } = await import('./services/scheduledMaintenanceService.js');
  const schedule = await setMaintenanceSchedule(req.body || {}, req.user.id);
  res.json({ success: true, schedule });
}));

// Session management
router.get('/security/sessions', authRequired, asyncHandler(security.getActiveSessions));
router.delete('/security/sessions/:id', authRequired, asyncHandler(security.terminateSession));
router.delete('/security/sessions', authRequired, asyncHandler(security.terminateAllSessions));

// Login history
router.get('/security/login-history', authRequired, asyncHandler(security.getLoginHistory));

// Favorite fundis (customer only)
router.get('/favorites/fundis', authRequired, asyncHandler(security.listFavoriteFundis));
router.post('/favorites/fundis', authRequired, asyncHandler(security.addFavoriteFundi));
router.delete('/favorites/fundis/:fundiId', authRequired, asyncHandler(security.removeFavoriteFundi));

// API integrations (admin only)
router.get('/admin/integrations', authRequired, requireRole('admin'), asyncHandler(security.listApiIntegrations));
router.post('/admin/integrations/:service/test', authRequired, requireRole('admin'), asyncHandler(security.testApiIntegration));

// ============================================================
// Push notifications + SMS — device registration + status
// ============================================================
import { registerDeviceToken, unregisterDeviceToken, getPushStatus } from './services/pushService.js';
import { getSmsStatus, sendSms } from './services/smsService.js';

router.post('/devices/register', authRequired, asyncHandler(async (req, res) => {
  const { token, platform = 'web' } = req.body || {};
  if (!token) throw badRequest('Device token is required');
  await registerDeviceToken({ userId: req.user.id, token, platform });
  res.status(201).json({ success: true });
}));

router.delete('/devices/:token', authRequired, asyncHandler(async (req, res) => {
  await unregisterDeviceToken(req.params.token, req.user.id);
  res.json({ success: true });
}));

router.get('/notifications/push/status', authRequired, asyncHandler(async (_req, res) => {
  res.json({ success: true, ...getPushStatus() });
}));

router.get('/notifications/sms/status', authRequired, asyncHandler(async (_req, res) => {
  res.json({ success: true, ...getSmsStatus() });
}));

router.get('/notifications', authRequired, asyncHandler(users.notifications));
router.patch('/notifications/read-all', authRequired, asyncHandler(users.markAllNotificationsRead));
router.patch('/notifications/:id/read', authRequired, asyncHandler(users.markNotificationRead));
// Spec §pricing: prices are NEVER taken from the client. Plans live in the
// subscription_plans table (migration 043) so admins can reprice without a
// deploy; the request body only chooses the plan. Legacy 'monthly'/'yearly'
// codes map onto the caller's audience for backward compatibility.
const LEGACY_PLAN_ALIASES = Object.freeze({
  monthly: { fundi: 'fundi_pro_monthly', company: 'company_growth_monthly' },
  yearly: { fundi: 'fundi_pro_yearly', company: 'company_growth_yearly' },
});

router.get('/subscriptions/plans', asyncHandler(async (_req, res) => {
  const { query } = await import('./db.js');
  const rows = await query(
    `select code, name, audience, price, currency, duration_days, features
     from subscription_plans where is_active = true order by audience, price`,
  );
  res.json({ success: true, plans: rows.rows });
}));

router.post('/subscriptions/activate', authRequired, asyncHandler(async (req, res) => {
  // Spec §7: companies subscribe like fundis. The paying principal is the
  // company owner/admin user; the subscription row records subscriber_type.
  if (!req.user || !['fundi', 'company_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only fundis and companies can activate subscriptions' });
  }
  const { plan = 'monthly', mpesaNumber } = req.body || {};
  const audience = req.user.role === 'company_admin' ? 'company' : 'fundi';
  const planCode = LEGACY_PLAN_ALIASES[plan]?.[audience] || plan;
  const { query } = await import('./db.js');
  const planRow = await query(
    `select code, price, duration_days, name from subscription_plans
     where code = $1 and is_active = true and audience = $2`,
    [planCode, audience],
  );
  const planDef = planRow.rows[0];
  if (!planDef) {
    return res.status(400).json({ success: false, message: `Unknown subscription plan '${plan}'. Valid plans: monthly, yearly` });
  }
  const amount = Number(planDef.price);
  const durationDays = planDef.duration_days;
  if (!mpesaNumber) {
    return res.status(400).json({ success: false, message: 'M-Pesa number required for subscription payment' });
  }
  const { assertValidMpesaPhone, initiateStkPush } = await import('./services/mpesaService.js');
  const normalizedPhone = assertValidMpesaPhone(mpesaNumber);

  // Create subscription as 'pending' — not active until payment confirmed.
  // expires_at here is a placeholder; it is set from plan duration on activation.
  const subResult = await query(
    `insert into subscriptions (fundi_id, plan, amount, status, starts_at, expires_at, subscriber_type)
     values ($1, $2, $3, 'pending', now(), now() + ($4::text || ' days')::interval, $5)
     returning *`,
    [req.user.id, planDef.code, amount, String(durationDays), audience],
  );

  // Initiate M-Pesa STK push for the subscription fee
  try {
    const daraja = await initiateStkPush({
      phone: mpesaNumber,
      amount,
      accountReference: `SUB-${req.user.id.slice(0, 8)}`,
      transactionDesc: `PataFundi ${planDef.name} subscription`,
    });

    // Store checkout_request_id on the subscription for webhook matching
    await query(
      `update subscriptions set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{checkout_request_id}', $2::text)
       where id = $1`,
      [subResult.rows[0].id, JSON.stringify(daraja.CheckoutRequestID)],
    );

    res.status(202).json({
      success: true,
      subscriptionId: subResult.rows[0].id,
      checkoutRequestId: daraja.CheckoutRequestID,
      message: 'Subscription payment initiated. Complete the M-Pesa prompt to activate.',
    });
  } catch (err) {
    // M-Pesa failed — mark subscription as failed
    await query(`update subscriptions set status = 'failed' where id = $1`, [subResult.rows[0].id]);
    res.status(502).json({
      success: false,
      message: 'M-Pesa STK push failed. Try again or contact support.',
      subscriptionId: subResult.rows[0].id,
    });
  }
}));

// Spec §22-23: subscribers manage their own subscription lifecycle.
router.get('/subscriptions/mine', authRequired, asyncHandler(async (req, res) => {
  const rows = await query(
    `select id, plan, amount, status, starts_at, expires_at, subscriber_type, created_at
     from subscriptions where fundi_id = $1 order by created_at desc limit 24`,
    [req.user.id],
  );
  res.json({ success: true, subscriptions: rows.rows });
}));

router.get('/subscriptions/status', authRequired, asyncHandler(async (req, res) => {
  const row = await query(
    `select id, plan, expires_at from subscriptions
     where fundi_id = $1 and status = 'active' and expires_at > now()
     order by expires_at desc limit 1`,
    [req.user.id],
  );
  const active = Boolean(row.rows[0]);
  res.json({
    success: true,
    active,
    plan: active ? row.rows[0].plan : null,
    expiresAt: active ? row.rows[0].expires_at : null,
  });
}));

router.post('/subscriptions/cancel', authRequired, asyncHandler(async (req, res) => {
  // Cancelling stops future renewals; an already-active period keeps running
  // until expires_at (standard marketplace behaviour, spec §22 "cancellation").
  const row = await query(
    `update subscriptions set status = 'cancelled'
     where fundi_id = $1 and status in ('pending', 'active') returning id, status, expires_at`,
    [req.user.id],
  );
  if (!row.rows[0]) {
    return res.status(400).json({ success: false, message: 'No cancellable subscription found' });
  }
  await auditLog({
    userId: req.user.id,
    action: 'subscription.cancelled',
    entityType: 'subscription',
    entityId: row.rows[0].id,
    metadata: { previousStatus: row.rows[0].status },
  });
  res.json({ success: true, subscription: row.rows[0] });
}));

// Spec §71: support is a two-way thread. Authenticated users file with their
// identity attached, follow their tickets, and reply; staff get the full thread
// plus reply/set-status/priority tools.
router.post('/support/ticket', optionalAuth, supportRateLimit, asyncHandler(content.supportTicket));
router.get('/support/tickets/mine', authRequired, asyncHandler(content.mySupportTickets));
router.get('/support/tickets/:id', authRequired, asyncHandler(content.getSupportTicket));
router.post('/support/tickets/:id/messages', authRequired, supportRateLimit, asyncHandler(content.replySupportTicket));
router.get('/admin/support/tickets', authRequired, requireRole('admin'), asyncHandler(content.listSupportTickets));
router.patch('/admin/support/tickets/:id', authRequired, requireRole('admin'), asyncHandler(content.updateSupportTicket));
router.get('/admin/support/tickets/:id/messages', authRequired, requireRole('admin'), asyncHandler(content.adminTicketMessages));
router.post('/admin/support/tickets/:id/messages', authRequired, requireRole('admin'), asyncHandler(content.adminReplyTicket));
// Spec §26-28: chargeback records tied to real payments, decided by finance staff.
router.get('/admin/chargebacks', authRequired, requireRole('admin'), asyncHandler(chargebacks.listChargebacks));
router.post('/admin/chargebacks', authRequired, requireRole('admin'), asyncHandler(chargebacks.createChargeback));
router.post('/admin/chargebacks/:id/decision', authRequired, requireRole('admin'), asyncHandler(chargebacks.decideChargeback));
router.post('/fraud-report', authRequired, asyncHandler(content.fraudReport));
router.post('/jobs/:jobId/fraud-report', authRequired, asyncHandler(content.fraudReport));

// Spec §46-47: admin content management for the public Blog and Careers pages.
router.get('/admin/blog', authRequired, requireRole('admin'), asyncHandler(content.adminListBlogPosts));
router.post('/admin/blog', authRequired, requireRole('admin'), asyncHandler(content.adminCreateBlogPost));
router.patch('/admin/blog/:id', authRequired, requireRole('admin'), asyncHandler(content.adminUpdateBlogPost));
router.delete('/admin/blog/:id', authRequired, requireRole('admin'), asyncHandler(content.adminDeleteBlogPost));
router.get('/admin/careers/jobs', authRequired, requireRole('admin'), asyncHandler(content.adminListCareerJobs));
router.post('/admin/careers/jobs', authRequired, requireRole('admin'), asyncHandler(content.adminCreateCareerJob));
router.patch('/admin/careers/jobs/:id', authRequired, requireRole('admin'), asyncHandler(content.adminUpdateCareerJob));
router.delete('/admin/careers/jobs/:id', authRequired, requireRole('admin'), asyncHandler(content.adminDeleteCareerJob));
router.get('/blog', asyncHandler(content.genericList('posts')));
router.get('/blog/:slug', asyncHandler(content.blogPost));
router.get('/careers/jobs', asyncHandler(content.genericList('jobs')));
router.post('/careers/apply', asyncHandler(content.careerApply));
router.get('/admin/careers/applications', authRequired, requireRole('admin'), asyncHandler(content.listCareerApplications));
router.get('/help', asyncHandler(content.help));
router.get('/policies/:slug', asyncHandler(content.policy));
router.get('/services/:slug', asyncHandler(content.service));

router.post('/maps/reverse-geocode', asyncHandler(maps.reverseGeocode));
router.get('/maps/search', asyncHandler(maps.search));
router.post('/maps/directions', asyncHandler(maps.directions));

router.get('/jobs/:jobId/messages', authRequired, asyncHandler(chat.listMessages));
router.post('/jobs/:jobId/messages', authRequired, imageUpload.single('attachment'), asyncHandler(chat.sendMessage));
router.post('/jobs/:jobId/messages/read', authRequired, asyncHandler(chat.markRead));

router.get('/admin/verification-documents/:fundiId', authRequired, requireRole('admin'), requireAdminDocumentAccess, asyncHandler(storage.getVerificationDocuments));
router.get('/storage/verification/:id/signed-url', authRequired, requireRole('admin'), requireAdminDocumentAccess, asyncHandler(storage.getSignedDocumentUrl));
router.get('/jobs/:jobId/photos', authRequired, requireJobPhotoAccess, asyncHandler(storage.getJobPhotos));
router.get('/jobs/:jobId/photos/:photoId/signed-url', authRequired, requireJobPhotoAccess, asyncHandler(storage.getJobPhotoSignedUrl));
router.get('/disputes/:disputeId/files', authRequired, requireDisputeAccess, asyncHandler(storage.getDisputeFiles));
router.get('/storage/profile/:userId/signed-url', authRequired, requireProfilePhotoAccess, asyncHandler(storage.getProfilePhotoSignedUrl));
router.get('/storage/chat/:attachmentId/signed-url', authRequired, asyncHandler(storage.getChatAttachmentSignedUrl));
router.get('/storage/local/', authRequired, asyncHandler(storage.serveLocalFile));
router.get('/storage/local/*splat', authRequired, asyncHandler(storage.serveLocalFile));

router.get('/verification/challenges', authRequired, requireFundiAccount, asyncHandler(verification.getLivenessChallenges));
router.post('/verification/liveness/start', authRequired, requireFundiAccount, asyncHandler(verification.startLiveness));
router.post('/verification/liveness/:sessionId/frame', authRequired, requireFundiAccount, imageUpload.single('frame'), asyncHandler(verification.submitLivenessFrame));
router.post('/verification/liveness/:sessionId/complete', authRequired, requireFundiAccount, asyncHandler(verification.finishLiveness));
router.post('/verification/run-check', authRequired, requireFundiAccount, asyncHandler(verification.runVerificationCheck));
router.get('/verification/status', authRequired, requireFundiAccount, asyncHandler(verification.getVerificationStatus));


router.get('/trust/:userId', authRequired, asyncHandler(async (req, res) => {
  const { query } = await import('./db.js');
  if (req.user.role !== 'admin' && req.user.id !== req.params.userId) {
    const jobLink = await query(
      `select 1 from jobs where (customer_id = $1 and fundi_id = $2) or (customer_id = $2 and fundi_id = $1) limit 1`,
      [req.user.id, req.params.userId],
    );
    if (!jobLink.rows[0]) {
      const err = new Error('Not allowed to view this trust score');
      err.status = 403;
      throw err;
    }
  }
  const result = await query('select * from trust_scores where user_id = $1', [req.params.userId]);
  res.json({ success: true, trust: result.rows[0] || null });
}));

// ============================================================
// Enterprise Completeness — DR, GDPR, Productivity, Messaging, Emergency
// ============================================================

// ── Disaster Recovery ──────────────────────────────────────────
router.post('/admin/backups', authRequired, requirePerm('can_manage_backups'), asyncHandler(ent2.createBackupHandler));
router.get('/admin/backups', authRequired, requirePerm('can_manage_backups'), asyncHandler(ent2.listBackupsHandler));
router.post('/admin/backups/:id/restore', authRequired, requirePerm('can_manage_backups'), asyncHandler(ent2.restoreBackupHandler));

// ── GDPR ───────────────────────────────────────────────────────
router.post('/gdpr/export', authRequired, asyncHandler(ent2.requestDataExportHandler));
router.post('/gdpr/deletion', authRequired, asyncHandler(ent2.requestDataDeletionHandler));
router.get('/admin/gdpr-requests', authRequired, requirePerm('can_manage_gdpr_requests'), asyncHandler(ent2.listGdprRequestsHandler));
router.post('/admin/gdpr-requests/:id/process', authRequired, requirePerm('can_manage_gdpr_requests'), asyncHandler(ent2.processGdprRequestHandler));

// ── Staff Productivity ─────────────────────────────────────────
router.get('/staff/productivity/me', authRequired, asyncHandler(ent2.getMyProductivityHandler));
router.get('/staff/productivity/department/:department', authRequired, requirePerm('can_view_staff_productivity'), asyncHandler(ent2.getDepartmentProductivityHandler));
router.get('/staff/productivity/all', authRequired, requirePerm('can_view_staff_productivity'), asyncHandler(ent2.getAllStaffProductivityHandler));

// ── Internal Messaging ─────────────────────────────────────────
router.get('/staff/messages/channels', authRequired, requirePerm('can_use_internal_messaging'), asyncHandler(ent2.listChannelsHandler));
router.post('/staff/messages/send', authRequired, requirePerm('can_use_internal_messaging'), asyncHandler(ent2.sendMessageHandler));
router.get('/staff/messages/channel/:channelId', authRequired, requirePerm('can_use_internal_messaging'), asyncHandler(ent2.getChannelMessagesHandler));
router.get('/staff/messages/dm/:userId', authRequired, requirePerm('can_use_internal_messaging'), asyncHandler(ent2.getDirectMessagesHandler));
router.post('/staff/messages/:id/read', authRequired, requirePerm('can_use_internal_messaging'), asyncHandler(ent2.markMessageReadHandler));

// ── Emergency Controls ─────────────────────────────────────────
router.get('/admin/emergency/status', authRequired, requirePerm('can_use_emergency_controls'), asyncHandler(ent2.getEmergencyStatusHandler));
router.post('/admin/emergency/toggle', authRequired, requirePerm('can_use_emergency_controls'), asyncHandler(ent2.toggleEmergencyHandler));

// ── Category Commissions ───────────────────────────────────────
router.get('/admin/commission-overrides', authRequired, requirePerm('can_manage_commission_overrides'), asyncHandler(ent2.getCategoryCommissionsHandler));
router.put('/admin/commission-overrides', authRequired, requirePerm('can_manage_commission_overrides'), asyncHandler(ent2.updateCategoryCommissionHandler));

// ── Staff Lifecycle ────────────────────────────────────────────
router.post('/admin/staff/:id/reset-password', authRequired, requirePerm('can_reset_staff_password'), asyncHandler(ent2.resetStaffPasswordHandler));
router.post('/admin/staff/:id/require-2fa', authRequired, requirePerm('can_require_2fa'), asyncHandler(ent2.require2FAHandler));

// ── System Health ──────────────────────────────────────────────
router.get('/admin/system-health', authRequired, requirePerm('can_view_health'), asyncHandler(ent2.getSystemHealthHandler));

// ============================================================
// Fraud Prevention — 7 Systems
// ============================================================
import * as fp from './controllers/fraudPreventionController.js';

// Device Fingerprinting
router.post('/fraud/device-fingerprint', authRequired, asyncHandler(fp.submitDeviceFingerprint));
router.get('/fraud/device-history', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.getDeviceHistoryHandler));

// IP Reputation
router.get('/fraud/ip-reputation/:ip', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.getIpReputation));
router.post('/fraud/ip-report', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.reportIpHandler));

// Login History (Impossible Travel)
router.get('/fraud/login-history', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.getLoginHistory));

// GPS Spoof Detection
router.post('/fraud/gps-validate', authRequired, asyncHandler(fp.submitGpsValidation));
router.get('/fraud/gps-history/:userId', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.getGpsHistory));

// Blacklist
router.post('/fraud/blacklist/check', authRequired, asyncHandler(fp.checkBlacklistHandler));
router.post('/fraud/blacklist/check-batch', authRequired, asyncHandler(fp.checkBlacklistBatchHandler));
router.get('/fraud/blacklist', authRequired, requirePerm('can_view_fraud_prevention'), asyncHandler(fp.listBlacklistHandler));
router.post('/fraud/blacklist', authRequired, requirePerm('can_manage_blacklist'), asyncHandler(fp.addBlacklistHandler));
router.delete('/fraud/blacklist', authRequired, requirePerm('can_manage_blacklist'), asyncHandler(fp.removeBlacklistHandler));

// Behavioral Risk
router.get('/fraud/behavioral-risk', authRequired, requirePerm('can_view_fraud_prevention'), asyncHandler(fp.getBehavioralRiskHandler));
router.post('/fraud/behavioral-risk/recalculate', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.recalculateRiskHandler));

// Payment Fraud
router.get('/fraud/payment-fraud', authRequired, requirePerm('can_view_fraud_prevention'), asyncHandler(fp.getPaymentFraudHandler));
router.post('/fraud/payment-fraud/check', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.checkPaymentFraudHandler));
router.post('/fraud/payment-fraud/:id/resolve', authRequired, requirePerm('can_investigate_fraud'), asyncHandler(fp.resolvePaymentFraudHandler));

// Overview Dashboard
router.get('/fraud/overview', authRequired, requirePerm('can_view_fraud_prevention'), asyncHandler(fp.getFraudPreventionOverviewHandler));

// ============================================================
// Geo Matching & Geographic Restrictions
// ============================================================
import * as geo from './controllers/geoMatchingController.js';
import * as pricing from './controllers/pricingController.js';

// Smart matching (customer-facing)
router.post('/geo/find-fundis', authRequired, asyncHandler(geo.findFundisHandler));
router.post('/geo/surge-pricing', authRequired, asyncHandler(geo.surgePricingHandler));

// Fundi travel settings (fundi-facing)
router.get('/geo/travel-settings', authRequired, asyncHandler(geo.getTravelSettingsHandler));
router.put('/geo/travel-settings', authRequired, asyncHandler(geo.updateTravelSettingsHandler));

// CEO geo controls (super_admin)
router.get('/geo/controls', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.getGeoControlsHandler));
router.put('/geo/controls', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.updateGeoControlsHandler));

// Blocked regions (super_admin)
router.get('/geo/blocked-regions', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.listBlockedRegionsHandler));
router.post('/geo/blocked-regions', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.addBlockedRegionHandler));
router.delete('/geo/blocked-regions/:id', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.removeBlockedRegionHandler));

// Service radius rules (super_admin view, staff can read)
router.get('/geo/service-radius', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.getServiceRadiusRulesHandler));
router.put('/geo/service-radius', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.updateServiceRadiusRuleHandler));

// International bookings
router.post('/geo/international-booking', authRequired, asyncHandler(geo.createIntlBookingHandler));
router.get('/geo/international-bookings', authRequired, requirePerm('can_approve_international'), asyncHandler(geo.listIntlBookingsHandler));
router.post('/geo/international-bookings/:id/review', authRequired, requirePerm('can_approve_international'), asyncHandler(geo.reviewIntlBookingHandler));

// Geo zones (super_admin)
router.get('/geo/zones', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.listGeoZonesHandler));
router.post('/geo/zones', authRequired, requirePerm('can_manage_geo_controls'), asyncHandler(geo.createGeoZoneHandler));

// ============================================================
// Phase 2 Enterprise Operations (20 modules)
// ============================================================
import * as p2 from './controllers/enterpriseController3.js';

// Disaster Recovery
router.get('/enterprise/dr', authRequired, requirePerm('can_view_system_health'), asyncHandler(p2.drDashboardHandler));

// Incident Command Center
router.post('/enterprise/incidents', authRequired, requirePerm('can_manage_incidents'), asyncHandler(p2.createIncidentHandler));
router.get('/enterprise/incidents', authRequired, requirePerm('can_manage_incidents'), asyncHandler(p2.listIncidentsHandler));
router.get('/enterprise/incidents/:id', authRequired, requirePerm('can_manage_incidents'), asyncHandler(p2.getIncidentHandler));
router.post('/enterprise/incidents/:id/update', authRequired, requirePerm('can_manage_incidents'), asyncHandler(p2.incidentUpdateHandler));
router.post('/enterprise/incidents/:id/resolve', authRequired, requirePerm('can_manage_incidents'), asyncHandler(p2.resolveIncidentHandler));

// Internal CRM
router.get('/enterprise/crm/customer/:userId', authRequired, requirePerm('can_view_crm'), asyncHandler(p2.customerCRMHandler));
router.get('/enterprise/crm/fundi/:userId', authRequired, requirePerm('can_view_crm'), asyncHandler(p2.fundiCRMHandler));
router.post('/enterprise/crm/notes', authRequired, requirePerm('can_view_crm'), asyncHandler(p2.addCRMNoteHandler));

// Feature Flags (enhanced)
router.get('/enterprise/feature-flags', authRequired, requirePerm('can_manage_feature_flags'), asyncHandler(p2.getFeatureFlagsHandler));
router.post('/enterprise/feature-flags/toggle', authRequired, requirePerm('can_manage_feature_flags'), asyncHandler(p2.toggleFeatureFlagHandler));
router.post('/enterprise/feature-flags/override', authRequired, requirePerm('can_manage_feature_flags'), asyncHandler(p2.featureFlagOverrideHandler));

// Business Analytics
router.get('/enterprise/analytics', authRequired, requirePerm('can_view_analytics'), asyncHandler(p2.analyticsHandler));

// Audit Timeline
router.get('/enterprise/audit-timeline/:entityType/:entityId', authRequired, requirePerm('can_view_audit_timeline'), asyncHandler(p2.auditTimelineHandler));

// Fraud Heatmap
router.get('/enterprise/fraud-heatmap', authRequired, requirePerm('can_view_fraud_heatmap'), asyncHandler(p2.fraudHeatmapHandler));

// Queue System
router.get('/enterprise/queues', authRequired, requirePerm('can_manage_queues'), asyncHandler(p2.queueStatusHandler));
router.get('/enterprise/queues/jobs', authRequired, requirePerm('can_manage_queues'), asyncHandler(p2.queueJobsHandler));
router.post('/enterprise/queues/:id/retry', authRequired, requirePerm('can_manage_queues'), asyncHandler(p2.retryQueueJobHandler));

// HR Management
router.get('/enterprise/hr/employees', authRequired, requirePerm('can_manage_hr'), asyncHandler(p2.listEmployeesHandler));
router.post('/enterprise/hr/employees', authRequired, requirePerm('can_manage_hr'), asyncHandler(p2.createEmployeeHandler));
router.post('/enterprise/hr/leave', authRequired, asyncHandler(p2.requestLeaveHandler));
router.post('/enterprise/hr/leave/:id/approve', authRequired, requirePerm('can_manage_hr'), asyncHandler(p2.approveLeaveHandler));

// Marketplace Intelligence
router.get('/enterprise/market-intelligence', authRequired, requirePerm('can_view_marketplace_intelligence'), asyncHandler(p2.marketIntelHandler));

// ML Pricing
router.get('/enterprise/ml-pricing', authRequired, requirePerm('can_manage_ml_pricing'), asyncHandler(p2.mlPricingModelsHandler));
router.post('/enterprise/ml-pricing/calculate', authRequired, asyncHandler(p2.calculatePriceHandler));
router.post('/enterprise/ml-pricing/:id/approve', authRequired, requirePerm('can_manage_ml_pricing'), asyncHandler(p2.approveMLPricingHandler));

// Image Moderation
router.post('/enterprise/image-moderation', authRequired, asyncHandler(p2.submitModerationHandler));
router.get('/enterprise/image-moderation', authRequired, requirePerm('can_moderate_images'), asyncHandler(p2.moderationQueueHandler));
router.post('/enterprise/image-moderation/:id', authRequired, requirePerm('can_moderate_images'), asyncHandler(p2.moderateImageHandler));

// System Health
router.get('/enterprise/system-health', authRequired, requirePerm('can_view_system_health'), asyncHandler(p2.systemHealthHandler));

// Public Status Page (no auth)
router.get('/enterprise/public-status', asyncHandler(p2.publicStatusHandler));

// AI CEO Report
router.get('/enterprise/ceo-report', authRequired, requirePerm('can_view_ceo_reports'), asyncHandler(p2.ceoReportHandler));

// API Versions
router.get('/enterprise/api-versions', authRequired, asyncHandler(p2.apiVersionsHandler));

// ============================================================
// Enterprise Pricing Engine — Platform-calculated prices (no customer budgets)
// ============================================================

// Customer-facing: calculate a price quote (auth required)
router.post('/pricing/calculate', authRequired, asyncHandler(pricing.calculatePrice));

// Public: list service base prices
router.get('/pricing/services', asyncHandler(pricing.listServicePrices));

// Admin: get full pricing config
router.get('/pricing/config', authRequired, requireRole('admin'), asyncHandler(pricing.getPricingConfig));

// Admin: update service base price
router.put('/pricing/services/:category', authRequired, requireRole('admin'), asyncHandler(pricing.updateServicePrice));

// Admin: update global multipliers
router.put('/pricing/config', authRequired, requireRole('admin'), asyncHandler(pricing.updatePricingConfig));

// Admin: AI pricing recommendations
router.get('/pricing/recommendations', authRequired, requireRole('admin'), asyncHandler(pricing.listRecommendations));
router.post('/pricing/recommendations/generate', authRequired, requireRole('admin'), asyncHandler(pricing.generateRecommendations));
router.post('/pricing/recommendations/:id/review', authRequired, requireRole('admin'), asyncHandler(pricing.reviewRecommendation));

// ============================================================
// Financial Confidentiality System — CEO-only financial intelligence
// Customers and fundis never see internal financial data.
// Staff see only what they need. CEO sees everything.
// ============================================================
import * as financial from './controllers/financialController.js';
import { requireFinancialAccess } from './services/financialConfidentialityService.js';

// CEO Financial Dashboard (super_admin only)
router.get('/financial/dashboard', authRequired, requireRole('admin'), asyncHandler(financial.ceoFinancialDashboard));

// Commission Campaigns (CEO creates, approves, cancels)
router.get('/financial/campaigns', authRequired, requireRole('admin'), asyncHandler(financial.listCampaigns));
router.post('/financial/campaigns', authRequired, requireRole('admin'), asyncHandler(financial.createCampaign));
router.post('/financial/campaigns/:id/approve', authRequired, requireRole('admin'), asyncHandler(financial.approveCampaign));
router.post('/financial/campaigns/:id/cancel', authRequired, requireRole('admin'), asyncHandler(financial.cancelCampaign));

// Financial Access Grants (CEO grants staff temporary access)
router.get('/financial/access-grants', authRequired, requireRole('admin'), asyncHandler(financial.listAccessGrants));
router.post('/financial/access-grants', authRequired, requireRole('admin'), asyncHandler(financial.grantFinancialAccess));
router.delete('/financial/access-grants/:id', authRequired, requireRole('admin'), asyncHandler(financial.revokeFinancialAccess));

// ============================================================
// Global Multi-Country System — 100+ country support
// ============================================================
import * as globalCtrl from './controllers/globalController.js';

// Public: list countries, languages
router.get('/global/countries', asyncHandler(globalCtrl.listCountries));
router.get('/global/countries/:code', asyncHandler(globalCtrl.getCountry));
router.get('/global/languages', asyncHandler(globalCtrl.listLanguages));
router.get('/global/translations/:lang', asyncHandler(globalCtrl.getTranslationsForLang));
router.get('/global/payments/:countryCode', asyncHandler(globalCtrl.getPaymentMethods));
router.get('/global/verification/:countryCode', asyncHandler(globalCtrl.getVerificationReqs));
router.get('/global/emergency/:countryCode', asyncHandler(globalCtrl.getEmergencyContacts));
router.get('/global/pricing/:countryCode', asyncHandler(globalCtrl.getPricingConfig));
router.get('/global/services/:countryCode', asyncHandler(globalCtrl.getCountryServices));
router.get('/global/exchange-rates', asyncHandler(globalCtrl.getRates));
router.get('/global/convert', asyncHandler(globalCtrl.convertAmount));
router.get('/global/detect-country', asyncHandler(globalCtrl.detectCountry));

// Admin: manage countries, exchange rates
router.post('/global/countries', authRequired, requireRole('admin'), asyncHandler(globalCtrl.createCountry));
router.put('/global/countries/:code', authRequired, requireRole('admin'), asyncHandler(globalCtrl.updateCountry));
router.post('/global/exchange-rates', authRequired, requireRole('admin'), asyncHandler(globalCtrl.updateRates));
router.get('/global/analytics', authRequired, requireRole('admin'), asyncHandler(globalCtrl.getAnalytics));
router.get('/global/dashboard', authRequired, requireRole('admin'), asyncHandler(globalCtrl.getGlobalDashboard));
