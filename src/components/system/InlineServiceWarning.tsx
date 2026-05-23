/**
 * InlineServiceWarning — compact, non-blocking warning for partial service issues.
 * Shows a subtle banner, never technical errors.
 */
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function InlineServiceWarning({
  message = 'Some content may not load. Tap to retry.',
  onRetry,
}: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          aria-label="Retry"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
