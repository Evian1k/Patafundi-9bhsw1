/**
 * Phase 2 Enterprise Controller — 20 modules API
 */
import {
  getDisasterRecoveryDashboard,
  createIncident, listIncidents, getIncidentDetails, addIncidentUpdate, resolveIncident,
  getCustomerCRM, getFundiCRM, addCRMNote,
  getFeatureFlags, toggleFeatureFlag, setFeatureFlagOverride,
  getBusinessAnalytics,
  getAuditTimeline, addAuditTimelineEntry,
  getFraudHeatmap,
  getQueueStatus, getQueueJobs, retryQueueJob,
  listEmployees, createEmployee, requestLeave, approveLeave,
  getMarketplaceIntelligence,
  getMLPricingModels, calculateAdaptivePrice, approveMLPricingModel,
  submitImageForModeration, getModerationQueue, moderateImage,
  getSystemHealth,
  getPublicStatusPage,
  generateCEOReport,
  getAPIVersions,
} from '../services/enterpriseService3.js';

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// ── Disaster Recovery ─────────────────────────────────────────
export async function drDashboardHandler(_req, res) {
  const dashboard = await getDisasterRecoveryDashboard();
  res.json({ success: true, dashboard });
}

// ── Incident Command Center ───────────────────────────────────
export async function createIncidentHandler(req, res) {
  const incident = await createIncident(req.body || {}, req.user.id);
  res.status(201).json({ success: true, incident });
}

export async function listIncidentsHandler(req, res) {
  const incidents = await listIncidents({ status: req.query.status, severity: req.query.severity });
  res.json({ success: true, incidents });
}

export async function getIncidentHandler(req, res) {
  const details = await getIncidentDetails(req.params.id);
  res.json({ success: true, ...details });
}

export async function incidentUpdateHandler(req, res) {
  const update = await addIncidentUpdate(req.params.id, req.body || {}, req.user.id);
  res.status(201).json({ success: true, update });
}

export async function resolveIncidentHandler(req, res) {
  const incident = await resolveIncident(req.params.id, req.body || {}, req.user.id);
  res.json({ success: true, incident });
}

// ── Internal CRM ──────────────────────────────────────────────
export async function customerCRMHandler(req, res) {
  const crm = await getCustomerCRM(req.params.userId);
  res.json({ success: true, crm });
}

export async function fundiCRMHandler(req, res) {
  const crm = await getFundiCRM(req.params.userId);
  res.json({ success: true, crm });
}

export async function addCRMNoteHandler(req, res) {
  const { entityType, entityId, note, tags } = req.body || {};
  if (!entityType || !entityId || !note) throw badRequest('entityType, entityId, note required');
  const result = await addCRMNote(entityType, entityId, note, req.user.id, tags || []);
  res.status(201).json({ success: true, note: result });
}

// ── Feature Flags ─────────────────────────────────────────────
export async function getFeatureFlagsHandler(_req, res) {
  const flags = await getFeatureFlags();
  res.json({ success: true, flags });
}

export async function toggleFeatureFlagHandler(req, res) {
  const { key, enabled } = req.body || {};
  if (!key) throw badRequest('key required');
  await toggleFeatureFlag(key, enabled, req.user.id);
  res.json({ success: true });
}

export async function featureFlagOverrideHandler(req, res) {
  const { key, userId, county, enabled } = req.body || {};
  if (!key) throw badRequest('key required');
  await setFeatureFlagOverride(key, { userId, county, enabled }, req.user.id);
  res.json({ success: true });
}

// ── Business Analytics ────────────────────────────────────────
export async function analyticsHandler(req, res) {
  const analytics = await getBusinessAnalytics(req.query.period || '30d');
  res.json({ success: true, analytics });
}

// ── Audit Timeline ────────────────────────────────────────────
export async function auditTimelineHandler(req, res) {
  const timeline = await getAuditTimeline(req.params.entityType, req.params.entityId);
  res.json({ success: true, timeline });
}

// ── Fraud Heatmap ─────────────────────────────────────────────
export async function fraudHeatmapHandler(req, res) {
  const heatmap = await getFraudHeatmap(Number(req.query.days) || 30);
  res.json({ success: true, heatmap });
}

// ── Queue System ──────────────────────────────────────────────
export async function queueStatusHandler(_req, res) {
  const status = await getQueueStatus();
  res.json({ success: true, queues: status });
}

export async function queueJobsHandler(req, res) {
  const jobs = await getQueueJobs(req.query.queue, req.query.status, Number(req.query.limit) || 50);
  res.json({ success: true, jobs });
}

export async function retryQueueJobHandler(req, res) {
  await retryQueueJob(req.params.id);
  res.json({ success: true });
}

// ── HR Management ─────────────────────────────────────────────
export async function listEmployeesHandler(_req, res) {
  const employees = await listEmployees();
  res.json({ success: true, employees });
}

export async function createEmployeeHandler(req, res) {
  const employee = await createEmployee(req.body || {}, req.user.id);
  res.status(201).json({ success: true, employee });
}

export async function requestLeaveHandler(req, res) {
  const leave = await requestLeave(req.body.employeeId, req.body);
  res.status(201).json({ success: true, leave });
}

export async function approveLeaveHandler(req, res) {
  await approveLeave(req.params.id, req.user.id);
  res.json({ success: true });
}

// ── Marketplace Intelligence ──────────────────────────────────
export async function marketIntelHandler(req, res) {
  const intel = await getMarketplaceIntelligence(Number(req.query.days) || 7);
  res.json({ success: true, intelligence: intel });
}

// ── ML Pricing ────────────────────────────────────────────────
export async function mlPricingModelsHandler(_req, res) {
  const models = await getMLPricingModels();
  res.json({ success: true, models });
}

export async function calculatePriceHandler(req, res) {
  const result = await calculateAdaptivePrice(req.body || {});
  res.json({ success: true, pricing: result });
}

export async function approveMLPricingHandler(req, res) {
  await approveMLPricingModel(req.params.id, req.user.id);
  res.json({ success: true });
}

// ── Image Moderation ──────────────────────────────────────────
export async function submitModerationHandler(req, res) {
  const result = await submitImageForModeration(req.body || {});
  res.status(201).json({ success: true, item: result });
}

export async function moderationQueueHandler(req, res) {
  const queue = await getModerationQueue(req.query.status || 'pending', Number(req.query.limit) || 50);
  res.json({ success: true, queue });
}

export async function moderateImageHandler(req, res) {
  await moderateImage(req.params.id, req.body || {}, req.user.id);
  res.json({ success: true });
}

// ── System Health ─────────────────────────────────────────────
export async function systemHealthHandler(_req, res) {
  const health = await getSystemHealth();
  res.json({ success: true, health });
}

// ── Public Status Page ────────────────────────────────────────
export async function publicStatusHandler(_req, res) {
  const status = await getPublicStatusPage();
  res.json({ success: true, ...status });
}

// ── AI CEO Report ─────────────────────────────────────────────
export async function ceoReportHandler(_req, res) {
  const report = await generateCEOReport();
  res.json({ success: true, report });
}

// ── API Versions ──────────────────────────────────────────────
export async function apiVersionsHandler(_req, res) {
  const versions = await getAPIVersions();
  res.json({ success: true, versions });
}
