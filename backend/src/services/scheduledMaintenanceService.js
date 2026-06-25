/**
 * Scheduled Maintenance Service
 *
 * Automatically enables maintenance mode on a configured schedule.
 * Default: every Wednesday from 02:00 to 04:00 Africa/Nairobi (EAT).
 *
 * Super admin can configure:
 *   - Day of week (0=Sunday ... 3=Wednesday ... 6=Saturday)
 *   - Start hour (0-23)
 *   - Duration in hours
 *   - Enable/disable the schedule
 *
 * The scheduler checks every minute and toggles the maintenance_mode
 * feature flag on/off based on the schedule.
 */
import { query } from '../db.js';
import { setFeatureFlag } from './securityService.js';

// Default: Wednesday (3), 2:00 AM, 2 hours duration
const DEFAULT_SCHEDULE = {
  enabled: true,
  dayOfWeek: 3, // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  startHour: 2, // 2:00 AM
  durationHours: 2, // 2 hours (2:00 AM to 4:00 AM)
  timezone: 'Africa/Nairobi',
};

let cachedSchedule = null;
let lastChecked = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get the maintenance schedule from platform_settings.
 * Falls back to DEFAULT_SCHEDULE if not configured.
 */
export async function getMaintenanceSchedule() {
  const now = Date.now();
  if (cachedSchedule && now - lastChecked < CACHE_TTL_MS) {
    return cachedSchedule;
  }
  lastChecked = now;

  try {
    const result = await query(
      `select value from platform_settings where key = 'maintenance_schedule'`,
    );
    cachedSchedule = result.rows[0]?.value || DEFAULT_SCHEDULE;
  } catch {
    cachedSchedule = DEFAULT_SCHEDULE;
  }
  return cachedSchedule;
}

/**
 * Update the maintenance schedule.
 */
export async function setMaintenanceSchedule(schedule, updatedBy) {
  const merged = { ...DEFAULT_SCHEDULE, ...schedule };
  await query(
    `insert into platform_settings (key, value, updated_by)
     values ('maintenance_schedule', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(merged), updatedBy],
  );
  cachedSchedule = merged;
  return merged;
}

/**
 * Check if the current time falls within a scheduled maintenance window.
 * Returns true if maintenance should be ON.
 */
export function isInMaintenanceWindow(schedule, now = new Date()) {
  if (!schedule?.enabled) return false;

  const dayOfWeek = now.getDay(); // 0=Sunday ... 6=Saturday
  const hour = now.getHours();

  if (dayOfWeek !== schedule.dayOfWeek) return false;

  const startHour = schedule.startHour;
  const endHour = startHour + schedule.durationHours;

  // Simple same-day window (e.g., 2:00 AM to 4:00 AM)
  if (endHour <= 24) {
    return hour >= startHour && hour < endHour;
  }

  // Window crosses midnight (e.g., 23:00 to 02:00)
  // For now, only same-day windows are supported
  return hour >= startHour || hour < (endHour - 24);
}

/**
 * Main scheduler loop — called every minute by server.js.
 * Compares the current time to the maintenance schedule and toggles
 * the maintenance_mode feature flag accordingly.
 *
 * IMPORTANT: This ONLY controls the SCHEDULED maintenance.
 * Super admin can still manually toggle maintenance on/off at any time
 * via /staff/system or /admin/settings. Manual toggles take precedence —
 * if super admin turns maintenance ON manually on a Friday, it stays on
 * until super admin turns it off.
 *
 * The scheduler only:
 *   - Turns maintenance ON when the window starts (if not already on)
 *   - Turns maintenance OFF when the window ends (if it was on due to schedule)
 */
export async function runScheduledMaintenanceCheck() {
  try {
    const schedule = await getMaintenanceSchedule();
    if (!schedule.enabled) return;

    const now = new Date();
    const inWindow = isInMaintenanceWindow(schedule, now);

    // Get current maintenance state
    const flagResult = await query(
      `select is_enabled, updated_at from feature_flags where key = 'maintenance_mode'`,
    );
    const currentEnabled = flagResult.rows[0]?.is_enabled === true;
    const lastUpdated = flagResult.rows[0]?.updated_at ? new Date(flagResult.rows[0].updated_at) : null;

    // Track whether maintenance was turned on by the scheduler (vs manual)
    const schedResult = await query(
      `select value from platform_settings where key = 'maintenance_scheduler_state'`,
    );
    const schedulerState = schedResult.rows[0]?.value || { activatedByScheduler: false };

    if (inWindow && !currentEnabled) {
      // Window started — turn maintenance ON
      await setFeatureFlag('maintenance_mode', true, null); // null = system/scheduler
      schedulerState.activatedByScheduler = true;
      schedulerState.activatedAt = new Date().toISOString();
      await query(
        `insert into platform_settings (key, value)
         values ('maintenance_scheduler_state', $1::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(schedulerState)],
      );
      console.log(`[maintenance] Scheduled maintenance started (day=${schedule.dayOfWeek}, hour=${schedule.startHour}, duration=${schedule.durationHours}h)`);
    } else if (!inWindow && currentEnabled && schedulerState.activatedByScheduler) {
      // Window ended AND maintenance was turned on by the scheduler — turn it OFF
      await setFeatureFlag('maintenance_mode', false, null);
      schedulerState.activatedByScheduler = false;
      schedulerState.deactivatedAt = new Date().toISOString();
      await query(
        `insert into platform_settings (key, value)
         values ('maintenance_scheduler_state', $1::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(schedulerState)],
      );
      console.log('[maintenance] Scheduled maintenance ended');
    }
  } catch (err) {
    console.warn('[maintenance] scheduler check failed:', err.message);
  }
}
