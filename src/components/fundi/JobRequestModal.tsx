import { motion } from 'framer-motion';
import { MapPin, Timer, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function JobRequestModal({
  request,
  remainingSec,
  onAccept,
  onDecline,
}: {
  request: Record<string, unknown>;
  remainingSec: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const title = (request?.title || request?.category || 'New Job Request') as string;
  const description = (request?.description || '') as string;
  const distanceKm = typeof request?.distanceKm === 'number' ? request.distanceKm : null;
  const estimatedPrice = request?.estimatedPrice != null ? Number(request.estimatedPrice) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4"
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card w-full max-w-md rounded-2xl p-6 shadow-xl border border-border/50"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-sm text-primary">Incoming request</span>
          </div>
          <button onClick={onDecline} className="p-1 hover:bg-muted rounded-full transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <h3 className="font-bold text-xl mb-4">{title}</h3>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-secondary rounded-xl text-center">
            <Timer className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Time left</p>
            <p className={`font-bold text-lg ${remainingSec <= 10 ? 'text-destructive' : 'text-foreground'}`}>
              {Math.max(0, remainingSec)}s
            </p>
          </div>
          <div className="p-3 bg-secondary rounded-xl text-center">
            <MapPin className="w-5 h-5 mx-auto mb-1 text-accent" />
            <p className="text-xs text-muted-foreground">Distance</p>
            <p className="font-bold">{distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'}</p>
          </div>
          <div className="p-3 bg-secondary rounded-xl text-center">
            <p className="text-xs text-muted-foreground mt-5">Est. pay</p>
            <p className="font-bold text-sm">
              {Number.isFinite(estimatedPrice) ? `KES ${estimatedPrice!.toFixed(0)}` : '—'}
            </p>
          </div>
        </div>

        {description ? (
          <div className="mb-4 p-3 bg-muted rounded-xl">
            <p className="text-xs font-medium text-muted-foreground mb-1">Job details</p>
            <p className="text-sm">{description}</p>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onDecline}>
            Decline
          </Button>
          <Button className="flex-1 bg-gradient-primary" onClick={onAccept}>
            Accept
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
