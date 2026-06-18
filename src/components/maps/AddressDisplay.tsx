import { MapPin } from 'lucide-react';
import { formatAddressLines, sanitizeLocationText, LOCATION_FALLBACK } from '@/lib/maps/geocoding';
import type { StructuredAddress } from '@/lib/maps/types';

interface AddressDisplayProps {
  address?: StructuredAddress | null;
  fallback?: string;
  compact?: boolean;
  className?: string;
}

export default function AddressDisplay({
  address,
  fallback = LOCATION_FALLBACK,
  compact = false,
  className = '',
}: AddressDisplayProps) {
  const safeFallback = sanitizeLocationText(fallback, LOCATION_FALLBACK);
  const lines = formatAddressLines(address);
  const displayLines = lines[0] === LOCATION_FALLBACK && safeFallback !== LOCATION_FALLBACK
    ? [safeFallback, ...lines.slice(1)].filter((l) => l !== LOCATION_FALLBACK || lines.length === 1)
    : lines;

  if (compact) {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm font-medium leading-snug">{displayLines.slice(0, 2).join(', ')}</p>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <MapPin className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 space-y-0.5">
        {displayLines.map((line, index) => (
          <p
            key={`${line}-${index}`}
            className={index === 0 ? 'text-sm font-semibold text-foreground' : 'text-xs text-muted-foreground'}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
