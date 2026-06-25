/**
 * Enterprise Controller — DR, GDPR, Productivity, Messaging, Emergency Controls
 */
import {
  createBackup, listBackups, restoreBackup,
  requestDataExport, requestDataDeletion, processDataDeletion,
  getStaffProductivity, getDepartmentProductivity, getAllStaffProductivity,
  listChannels, sendMessage, getChannelMessages, getDirectMessages, markMessageRead,
  getEmergencyControlStatus, toggleEmergencyControl,
  getCategoryCommissions, updateCategoryCommission,
  resetStaffPassword, forceLogoutUser, require2FA,
  getSystemHealth,
} from '../services/enterpriseService2.js';

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// ── Disaster Recovery ──────────────────────────────────────────
export async function createBackupHandler(req, res) {
  const { type = 'full' } = req.body || {};
  const result = await createBackup(type, req.user.id);
  res.status(201).json({ success: true, ...result });
}

export async function listBackupsHandler(_req, res) {
  const backups = await listBackups();
  res.json({ success: true, backups });
}

export async function restoreBackupHandler(req, res) {
  const result = await restoreBackup(req.params.id, req.user.id);
  res.json({ success: true, ...result });
}

// ── GDPR ───────────────────────────────────────────────────────
export async function requestDataExportHandler(req, res) {
  const result = await requestDataExport(req.user.id);
  res.json({ success: true, ...result });
}

export async function requestDataDeletionHandler(req, res) {
  const { reason } = req.body || {};
  const result = await requestDataDeletion(req.user.id, reason);
  res.json({ success: true, ...result });
}

export async function listGdprRequestsHandler(_req, res) {
  const { query: q } = await import('../db.js');
  const result = await q('select gr.*, u.email, u.full_name from gdpr_requests gr join users u on u.id = gr.user_id order by gr.created_at desc limit 100');
  res.json({ success: true, requests: result.rows });
}

export async function processGdprRequestHandler(req, res) {
  const result = await processDataDeletion(req.params.id, req.user.id);
  res.json({ success: true, ...result });
}

// ── Staff Productivity ─────────────────────────────────────────
export async function getMyProductivityHandler(req, res) {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const result = await getStaffProductivity(req.user.id, days);
  res.json({ success: true, metrics: result });
}

export async function getDepartmentProductivityHandler(req, res) {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const result = await getDepartmentProductivity(req.params.department, days);
  res.json({ success: true, staff: result });
}

export async function getAllStaffProductivityHandler(req, res) {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const result = await getAllStaffProductivity(days);
  res.json({ success: true, staff: result });
}

// ── Internal Messaging ─────────────────────────────────────────
export async function listChannelsHandler(req, res) {
  const channels = await listChannels(req.user.id, req.user.role);
  res.json({ success: true, channels });
}

export async function sendMessageHandler(req, res) {
  const { channelId, recipientId, message, isEmergency, attachmentUrl } = req.body || {};
  if (!message) throw badRequest('Message required');
  const result = await sendMessage(req.user.id, { channelId, recipientId, message, isEmergency, attachmentUrl });
  res.status(201).json({ success: true, message: result });
}

export async function getChannelMessagesHandler(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const messages = await getChannelMessages(req.params.channelId, limit);
  res.json({ success: true, messages });
}

export async function getDirectMessagesHandler(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const messages = await getDirectMessages(req.user.id, req.params.userId, limit);
  res.json({ success: true, messages });
}

export async function markMessageReadHandler(req, res) {
  await markMessageRead(req.params.id, req.user.id);
  res.json({ success: true });
}

// ── Emergency Controls ─────────────────────────────────────────
export async function getEmergencyStatusHandler(_req, res) {
  const status = await getEmergencyControlStatus();
  res.json({ success: true, controls: status });
}

export async function toggleEmergencyHandler(req, res) {
  const { control, action, reason } = req.body || {};
  if (!control || !action) throw badRequest('control and action required');
  const result = await toggleEmergencyControl(control, action, reason, req.user.id);
  res.json({ success: true, ...result });
}

// ── Category Commissions ───────────────────────────────────────
export async function getCategoryCommissionsHandler(_req, res) {
  const commissions = await getCategoryCommissions();
  res.json({ success: true, commissions });
}

export async function updateCategoryCommissionHandler(req, res) {
  const { category, rate, region } = req.body || {};
  if (!category || rate === undefined) throw badRequest('category and rate required');
  if (rate < 0 || rate > 100) throw badRequest('rate must be 0-100');
  const result = await updateCategoryCommission(category, rate, region, req.user.id);
  res.json({ success: true, commission: result });
}

// ── Staff Lifecycle ────────────────────────────────────────────
export async function resetStaffPasswordHandler(req, res) {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) throw badRequest('Password must be 8+ characters');
  const result = await resetStaffPassword(req.params.id, newPassword, req.user.id);
  res.json({ success: true, ...result });
}

export async function forceLogoutHandler(req, res) {
  const result = await forceLogoutUser(req.params.id, req.user.id);
  res.json({ success: true, ...result });
}

export async function require2FAHandler(req, res) {
  const { required } = req.body || {};
  const result = await require2FA(req.params.id, required, req.user.id);
  res.json({ success: true, ...result });
}

// ── System Health ──────────────────────────────────────────────
export async function getSystemHealthHandler(_req, res) {
  const health = await getSystemHealth();
  res.json({ success: true, health });
}
