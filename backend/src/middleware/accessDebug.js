/**
 * Access-decision logging hook.
 *
 * Previously this fired a DB query on every auth check to log fundi approval
 * status — useful during the initial 403 investigation, but a real performance
 * drag in production (1+ extra query per request).
 *
 * Now a no-op unless ACCESS_DEBUG=true is explicitly set, in which case it
 * logs a structured line without the extra DB hit.
 */
export async function logAccessDecision(req, label, extra = {}) {
  if (process.env.ACCESS_DEBUG !== 'true') return;
  console.info('[access-debug]', JSON.stringify({
    label,
    method: req.method,
    path: req.originalUrl || req.path,
    userId: req.user?.id ?? null,
    dbRole: req.user?.role ?? null,
    ...extra,
  }));
}
