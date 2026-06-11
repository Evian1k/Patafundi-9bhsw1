import express from 'express';
import { authRequired, optionalAuth, requireRole } from './middleware/auth.js';
import { requireFundiAccount, requireApprovedFundi } from './middleware/fundiAccess.js';
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
import * as chat from './controllers/chatController.js';
import * as maps from './controllers/mapsController.js';
import * as fraud from './controllers/fraudController.js';
import * as storage from './controllers/storageController.js';
import * as verification from './controllers/verificationController.js';
import {
  requireAdminDocumentAccess,
  requireJobPhotoAccess,
  requireDisputeAccess,
  requireProfilePhotoAccess,
} from './middleware/storageAccess.js';
import { asyncHandler } from './utils/http.js';

export const router = express.Router();

router.get('/health', (_req, res) => res.json({
  success: true,
  service: 'patafundi-api',
  build: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
  deployId: process.env.RENDER_DEPLOY_ID || null,
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

router.post('/jobs', authRequired, asyncHandler(jobs.createJob));
router.get('/jobs', authRequired, asyncHandler(jobs.listJobs));
router.get('/jobs/fundi/active', authRequired, requireApprovedFundi, asyncHandler(jobs.activeFundiJob));
router.get('/jobs/:id', authRequired, asyncHandler(jobs.getJob));
router.post('/jobs/:id/photos', authRequired, imageUpload.array('photos', 10), asyncHandler(jobs.uploadJobPhotos));
router.patch('/jobs/:id', authRequired, asyncHandler(jobs.patchJob));
router.patch('/jobs/:id/status', authRequired, asyncHandler(jobs.updateStatus));
router.get('/jobs/:id/status', authRequired, asyncHandler(jobs.getJobStatus));
router.get('/jobs/:id/location', authRequired, asyncHandler(jobs.getJob));
router.post('/jobs/:id/accept', authRequired, requireApprovedFundi, asyncHandler(jobs.acceptJob));
router.post('/jobs/:id/cancel', authRequired, asyncHandler(jobs.cancelJob));
router.post('/jobs/:id/check-in', authRequired, requireApprovedFundi, asyncHandler(jobs.checkIn));
router.post('/jobs/:id/complete', authRequired, requireApprovedFundi, imageUpload.array('photos', 8), asyncHandler(jobs.completeJob));
router.post('/jobs/:id/confirm-completion', authRequired, asyncHandler(jobs.confirmCompletion));
router.post('/jobs/:id/review', authRequired, asyncHandler(jobs.submitReview));
router.post('/reviews', authRequired, asyncHandler(jobs.submitReview));

router.post('/payments/stk-push', authRequired, asyncHandler(payments.stkPush));
router.post('/payments/process/:jobId', authRequired, asyncHandler(payments.legacyProcess));
router.post('/payments/webhook', asyncHandler(payments.webhook));
router.post('/payments/daraja-callback', asyncHandler(payments.webhook));
router.get('/payments/job/:jobId', authRequired, asyncHandler(payments.paymentForJob));
router.get('/payments/escrow/:jobId', authRequired, asyncHandler(payments.escrowForJob));
router.get('/payments/wallet/balance', authRequired, asyncHandler(payments.walletBalance));

router.post('/payouts/request', authRequired, requireApprovedFundi, asyncHandler(payouts.requestPayout));
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
router.get('/admin/disputes', authRequired, requireRole('admin'), asyncHandler(disputes.listDisputes));
router.post('/admin/disputes/:id/resolve', authRequired, requireRole('admin'), asyncHandler(disputes.resolveDispute));
router.get('/admin/audit-logs', authRequired, requireRole('admin'), asyncHandler(admin.listTable('audit_logs', 'logs')));
router.get('/admin/reports', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/reports/analytics', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
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

router.get('/notifications', authRequired, asyncHandler(users.notifications));
router.patch('/notifications/read-all', authRequired, asyncHandler(users.markAllNotificationsRead));
router.patch('/notifications/:id/read', authRequired, asyncHandler(users.markNotificationRead));
router.post('/subscriptions/activate', authRequired, (_req, res) => res.json({ success: true }));

router.post('/support/ticket', asyncHandler(content.supportTicket));
router.post('/fraud-report', authRequired, asyncHandler(content.fraudReport));
router.post('/jobs/:jobId/fraud-report', authRequired, asyncHandler(content.fraudReport));
router.get('/blog', asyncHandler(content.genericList('posts')));
router.get('/blog/:slug', asyncHandler(content.blogPost));
router.get('/careers/jobs', asyncHandler(content.genericList('jobs')));
router.post('/careers/apply', (_req, res) => res.status(201).json({ success: true }));
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
router.get('/storage/local/:key(*)', authRequired, asyncHandler(storage.serveLocalFile));

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
