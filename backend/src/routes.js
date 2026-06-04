import express from 'express';
import multer from 'multer';
import { authRequired, requireRole } from './middleware/auth.js';
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
import { asyncHandler } from './utils/http.js';

const upload = multer({ dest: 'backend/uploads/' });
export const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, service: 'patafundi-api' }));

router.post('/auth/register', asyncHandler(auth.register));
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
router.get('/jobs/fundi/active', authRequired, requireRole('fundi', 'admin'), asyncHandler(jobs.activeFundiJob));
router.get('/jobs/:id', authRequired, asyncHandler(jobs.getJob));
router.patch('/jobs/:id', authRequired, asyncHandler(jobs.patchJob));
router.patch('/jobs/:id/status', authRequired, asyncHandler(jobs.updateStatus));
router.get('/jobs/:id/status', authRequired, asyncHandler(jobs.getJob));
router.get('/jobs/:id/location', authRequired, asyncHandler(jobs.getJob));
router.post('/jobs/:id/accept', authRequired, requireRole('fundi', 'admin'), asyncHandler(jobs.acceptJob));
router.post('/jobs/:id/cancel', authRequired, asyncHandler(jobs.cancelJob));
router.post('/jobs/:id/check-in', authRequired, requireRole('fundi', 'admin'), asyncHandler(jobs.checkIn));
router.post('/jobs/:id/complete', authRequired, requireRole('fundi', 'admin'), upload.array('photos'), asyncHandler(jobs.completeJob));
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

router.post('/payouts/request', authRequired, requireRole('fundi', 'admin'), asyncHandler(payouts.requestPayout));
router.post('/fundi/wallet/withdraw-request', authRequired, requireRole('fundi', 'admin'), asyncHandler(payouts.requestPayout));

router.post('/disputes', authRequired, asyncHandler(disputes.createDispute));
router.get('/disputes', authRequired, asyncHandler(disputes.listDisputes));
router.post('/disputes/:id/evidence', authRequired, upload.array('evidence'), asyncHandler(disputes.uploadEvidence));

router.post('/fundi/register', authRequired, upload.any(), asyncHandler(fundi.registerFundi));
router.get('/fundi/profile', authRequired, asyncHandler(fundi.profile));
router.put('/fundi/profile', authRequired, asyncHandler(fundi.updateProfile));
router.get('/fundi/approval-status', authRequired, asyncHandler(fundi.approvalStatus));
router.get('/fundi/search', asyncHandler(fundi.searchFundis));
router.get('/fundi/dashboard', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.dashboard));
router.get('/fundi/status', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.status));
router.post('/fundi/status/online', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.goOnline));
router.post('/fundi/status/offline', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.goOffline));
router.post('/fundi/location', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.location));
router.get('/fundi/wallet/transactions', authRequired, requireRole('fundi', 'admin'), asyncHandler(fundi.walletTransactions));
router.get('/fundi/ratings', authRequired, asyncHandler(fundi.ratings));
router.get('/fundi/:id/reviews', asyncHandler(fundi.ratings));
router.get('/fundi/:id', asyncHandler(fundi.publicFundi));

router.get('/admin/dashboard', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/dashboard-stats', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/fundis', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fundis', 'fundis')));
router.get('/admin/fundis/:id', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fundis', 'fundis')));
router.post('/admin/fundis/:id/approve', authRequired, requireRole('admin'), asyncHandler(admin.approveFundi));
router.post('/admin/fundis/:id/reject', authRequired, requireRole('admin'), asyncHandler(admin.rejectFundi));
router.get('/admin/customers', authRequired, requireRole('admin'), asyncHandler(admin.listTable('users', 'customers')));
router.post('/admin/customers/:id/block', authRequired, requireRole('admin'), asyncHandler(admin.listTable('users', 'customers')));
router.post('/admin/customers/:id/unblock', authRequired, requireRole('admin'), asyncHandler(admin.listTable('users', 'customers')));
router.get('/admin/jobs', authRequired, requireRole('admin'), asyncHandler(admin.listTable('jobs', 'jobs')));
router.get('/admin/payments', authRequired, requireRole('admin'), asyncHandler(admin.listTable('payments', 'payments')));
router.get('/admin/transactions', authRequired, requireRole('admin'), asyncHandler(admin.listTable('payments', 'transactions')));
router.get('/admin/escrow-queue', authRequired, requireRole('admin'), asyncHandler(admin.listTable('escrow_transactions', 'queue')));
router.post('/admin/escrow/:jobId/release', authRequired, requireRole('admin'), asyncHandler(payouts.releaseEscrow));
router.post('/admin/escrow/:jobId/freeze', authRequired, requireRole('admin'), asyncHandler(payouts.freezeEscrow));
router.get('/admin/disputes', authRequired, requireRole('admin'), asyncHandler(disputes.listDisputes));
router.post('/admin/disputes/:id/resolve', authRequired, requireRole('admin'), asyncHandler(disputes.resolveDispute));
router.get('/admin/audit-logs', authRequired, requireRole('admin'), asyncHandler(admin.listTable('audit_logs', 'logs')));
router.get('/admin/reports', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/reports/analytics', authRequired, requireRole('admin'), asyncHandler(admin.dashboard));
router.get('/admin/security/overview', authRequired, requireRole('admin'), asyncHandler(admin.securityOverview));
router.get('/admin/security-alerts', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fraud_alerts', 'alerts')));
router.get('/admin/trust-scores', authRequired, requireRole('admin'), asyncHandler(admin.listTable('trust_scores', 'scores')));
router.get('/admin/bypass-alerts', authRequired, requireRole('admin'), asyncHandler(admin.listTable('fraud_alerts', 'alerts')));
router.post('/admin/security-alerts/:id/resolve', authRequired, requireRole('admin'), asyncHandler(admin.securityOverview));
router.post('/admin/users/:id/force-logout', authRequired, requireRole('admin'), asyncHandler(admin.securityOverview));
router.post('/admin/users/:id/disable', authRequired, requireRole('admin'), asyncHandler(admin.securityOverview));
router.get('/admin/settings', authRequired, requireRole('admin'), (_req, res) => res.json({ success: true, settings: {} }));
router.put('/admin/settings', authRequired, requireRole('admin'), (_req, res) => res.json({ success: true }));

router.get('/notifications', authRequired, asyncHandler(admin.listTable('notifications', 'notifications')));
router.patch('/notifications/:id/read', authRequired, (_req, res) => res.json({ success: true }));
router.patch('/notifications/read-all', authRequired, (_req, res) => res.json({ success: true }));
router.post('/subscriptions/activate', authRequired, (_req, res) => res.json({ success: true }));

router.post('/support/ticket', asyncHandler(content.supportTicket));
router.post('/fraud-report', asyncHandler(content.fraudReport));
router.get('/blog', asyncHandler(content.genericList('posts')));
router.get('/blog/:slug', (_req, res) => res.json({ success: true, post: null }));
router.get('/careers/jobs', asyncHandler(content.genericList('jobs')));
router.post('/careers/apply', (_req, res) => res.status(201).json({ success: true }));
router.get('/help', (_req, res) => res.json({ success: true, categories: [], faqs: [] }));
router.get('/policies/:slug', (_req, res) => res.json({ success: true, policy: null }));
router.get('/services/:slug', (_req, res) => res.json({ success: true, service: null, fundis: [] }));

router.post('/maps/reverse-geocode', asyncHandler(maps.reverseGeocode));
router.post('/maps/directions', asyncHandler(maps.directions));

router.get('/jobs/:jobId/messages', authRequired, asyncHandler(chat.listMessages));
router.post('/jobs/:jobId/messages', authRequired, asyncHandler(chat.sendMessage));
router.post('/jobs/:jobId/messages/read', authRequired, asyncHandler(chat.markRead));
router.get('/trust/:userId', authRequired, asyncHandler(async (req, res) => {
  const result = await import('./db.js').then(({ query }) => query('select * from trust_scores where user_id = $1', [req.params.userId]));
  res.json({ success: true, trust: result.rows[0] || null });
}));
