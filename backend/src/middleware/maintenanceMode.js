/**
 * Maintenance Mode Middleware
 *
 * When the 'maintenance_mode' feature flag is enabled:
 *   - Staff (super_admin, admin, etc.) can still access all APIs
 *   - Customers and fundis get 503 with a maintenance message
 *   - Auth endpoints (/api/auth/*) are always allowed (so users can log in)
 *   - Health endpoint is always allowed
 *
 * Usage in server.js:
 *   import { maintenanceCheck } from './middleware/maintenanceMode.js';
 *   app.use('/api', maintenanceCheck, router);
 */
import { isFeatureEnabled } from '../services/securityService.js';

const STAFF_ROLES = new Set(['super_admin', 'admin', 'support_agent', 'fraud_analyst', 'finance_team', 'dispatch_team', 'devops_engineer', 'auditor']);

// Cache the maintenance flag for 10 seconds to balance DB load vs responsiveness
let cachedMaintenanceMode = false;
let lastChecked = 0;
const CACHE_TTL_MS = 10_000;

async function isMaintenanceMode() {
  const now = Date.now();
  if (now - lastChecked < CACHE_TTL_MS) {
    return cachedMaintenanceMode;
  }
  lastChecked = now;
  try {
    cachedMaintenanceMode = await isFeatureEnabled('maintenance_mode');
  } catch (err) {
    // DB query failed — fail OPEN (maintenance OFF)
    // Never lock users out due to a DB error
    console.warn('[maintenance] could not check maintenance_mode, defaulting to OFF:', err.message);
    cachedMaintenanceMode = false;
  }
  return cachedMaintenanceMode;
}

export async function maintenanceCheck(req, res, next) {
  // Always allow health checks
  if (req.path === '/health' || req.path === '/api/health') return next();

  // Always allow auth endpoints (login, register, OTP — users need to authenticate)
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/auth/')) return next();

  // Check if maintenance mode is on
  const isOn = await isMaintenanceMode();
  if (!isOn) return next();

  // Allow staff to access everything during maintenance
  if (req.user && STAFF_ROLES.has(req.user.role)) return next();

  // Block everyone else
  return res.status(503).json({
    success: false,
    message: 'PataFundi is under maintenance. We will be back shortly. Thank you for your patience.',
    maintenanceMode: true,
  });
}
