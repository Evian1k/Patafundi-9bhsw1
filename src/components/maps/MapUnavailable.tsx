import { MapPin } from 'lucide-react';

export default function MapUnavailable({
  height = '100%',
  message = 'Add VITE_GOOGLE_MAPS_API_KEY to enable in-app maps.',
}: {
  height?: string | number;
  message?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 bg-slate-900 text-slate-300"
      style={{ height, width: '100%' }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
        <MapPin className="h-7 w-7 text-primary" />
      </div>
      <p className="max-w-xs px-6 text-center text-sm">{message}</p>
    </div>
  );
}
