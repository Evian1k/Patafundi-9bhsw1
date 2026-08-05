import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Banner shown when a staff dashboard fails to load its data.
 * Without it a failed fetch is indistinguishable from a platform
 * that genuinely has zero jobs, zero revenue and zero alerts.
 */
export default function DashboardLoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 mb-6">
      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-red-800">Could not load dashboard data</div>
        <div className="text-sm text-red-700">{message}</div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}
