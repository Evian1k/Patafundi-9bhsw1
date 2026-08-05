/**
 * Structured logging for non-fatal errors.
 *
 * Some failures are genuinely non-fatal (best-effort audit writes, optional
 * background schedulers, notification side effects). Those must not abort the
 * surrounding operation, but they must never disappear either: without a log
 * line, a permanently broken side effect looks identical to a healthy one.
 *
 * Use `logNonFatal` inside a catch block, or `swallow` as a `.catch()` handler.
 */

/**
 * Log a non-fatal error with the scope that produced it.
 *
 * @param {string} scope Dot-separated identifier, e.g. 'gdpr.dataExport'.
 * @param {unknown} error The caught value.
 * @param {Record<string, unknown>} [context] Extra fields to include.
 */
export function logNonFatal(scope, error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const details = Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
  console.warn(`[non-fatal] ${scope}: ${message}${details}`);
  if (error instanceof Error && error.stack && process.env.NODE_ENV !== 'production') {
    console.warn(error.stack);
  }
}

/**
 * Build a `.catch()` handler that logs and resolves to undefined.
 *
 * @param {string} scope Dot-separated identifier, e.g. 'auth.accessLog'.
 * @param {Record<string, unknown>} [context] Extra fields to include.
 * @returns {(error: unknown) => void}
 */
export function swallow(scope, context = {}) {
  return (error) => logNonFatal(scope, error, context);
}
