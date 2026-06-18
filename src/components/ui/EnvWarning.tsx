/**
 * EnvWarning — compact inline warning when API is not configured.
 * Only shown to authorized users (devs/admins) who expect technical context.
 * Regular users see ServiceUnavailableState instead.
 */
import { AlertTriangle } from 'lucide-react';

interface Props { compact?: boolean }

export default function EnvWarning({ compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
        <span>Backend not connected. Configure environment to enable all features.</span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
      <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
        <AlertTriangle className="w-4 h-4" />
        Backend Not Connected
      </div>
      <p className="text-xs text-amber-700">
        Set <code className="bg-amber-100 px-1 rounded">VITE_API_URL</code> and{' '}
        <code className="bg-amber-100 px-1 rounded">VITE_SOCKET_URL</code> in your environment.
      </p>
    </div>
  );
}
