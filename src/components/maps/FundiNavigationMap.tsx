import { Navigation } from 'lucide-react';
import LiveTrackingMap from './LiveTrackingMap';
import AddressDisplay from './AddressDisplay';
import { useDirections } from '@/hooks/useDirections';
import { useAnimatedPosition } from '@/hooks/useAnimatedPosition';
import { useStructuredAddress } from '@/hooks/useStructuredAddress';
import type { Coordinates, StructuredAddress } from '@/lib/maps/types';

interface FundiNavigationMapProps {
  fundiPosition: Coordinates | null;
  destination: Coordinates | null;
  destinationLabel?: string;
  destinationAddress?: StructuredAddress | null;
  height?: string | number;
}

export default function FundiNavigationMap({
  fundiPosition,
  destination,
  destinationLabel = '',
  destinationAddress = null,
  height = 360,
}: FundiNavigationMapProps) {
  const animatedFundi = useAnimatedPosition(fundiPosition);
  const { directions, routePath } = useDirections(fundiPosition, destination, Boolean(fundiPosition && destination));
  const { address: resolvedDestination } = useStructuredAddress(destination, destinationLabel);

  const nextStep = directions?.steps?.[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-md">
      <LiveTrackingMap
        customer={destination}
        fundi={animatedFundi}
        routePath={routePath}
        height={height}
        viewMode="fundi"
        overlay={(
          <div className="pf-map-overlay-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ETA</p>
                <p className="text-2xl font-bold text-slate-900">
                  {directions ? `${directions.etaMinutes} min` : 'Calculating...'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance</p>
                <p className="text-2xl font-bold text-slate-900">
                  {directions ? `${directions.distanceKm.toFixed(1)} km` : '--'}
                </p>
              </div>
            </div>
          </div>
        )}
      />
      <div className="space-y-3 p-4">
        <AddressDisplay address={destinationAddress || resolvedDestination} fallback={destinationLabel} />
        {nextStep && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Navigation className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next turn</p>
              <p className="text-sm font-medium text-foreground">{nextStep.instruction}</p>
              <p className="text-xs text-muted-foreground">
                {Math.max(1, Math.round(nextStep.distanceMeters))} m ahead
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
