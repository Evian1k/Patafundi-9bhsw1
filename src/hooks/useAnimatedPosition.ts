import { useEffect, useRef, useState } from 'react';
import { lerpCoord } from '@/lib/maps/interpolation';
import type { Coordinates } from '@/lib/maps/types';

export function useAnimatedPosition(target: Coordinates | null, durationMs = 900) {
  const [position, setPosition] = useState<Coordinates | null>(target);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<Coordinates | null>(target);

  useEffect(() => {
    if (!target) {
      setPosition(null);
      fromRef.current = null;
      return;
    }

    if (!fromRef.current) {
      fromRef.current = target;
      setPosition(target);
      return;
    }

    const from = fromRef.current;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current == null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const next = lerpCoord(from, target, t);
      setPosition(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [target?.latitude, target?.longitude, durationMs]);

  return position;
}
