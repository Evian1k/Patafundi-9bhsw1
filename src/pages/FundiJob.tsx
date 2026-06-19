import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Phone, MessageCircle, CheckCircle2,
  Loader2, ChevronLeft, Camera, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { realtimeService } from '@/services/realtime';
import InAppChat from '@/components/chat/InAppChat';
import FundiNavigationMap from '@/components/maps/FundiNavigationMap';
import AddressDisplay from '@/components/maps/AddressDisplay';
import { sanitizeLocationText, LOCATION_FALLBACK } from '@/lib/maps/geocoding';
import { getCurrentPosition } from '@/lib/gps';
import type { Coordinates } from '@/lib/maps/types';

type Job = {
  id: string;
  title: string;
  description: string;
  category?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  status: string;
  estimatedPrice?: number | null;
  finalPrice?: number | null;
};

export default function FundiJob() {
  const { jobId: jobIdParam } = useParams();
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem('auth_token'), []);

  const [resolvedJobId, setResolvedJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalPrice, setFinalPrice] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  const [otpConfirmed, setOtpConfirmed] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [fundiPosition, setFundiPosition] = useState<Coordinates | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);

  useEffect(() => {
    apiClient.getCurrentUser().then((res) => {
      const u = res?.user as { id?: string } | undefined;
      if (u?.id) setCurrentUserId(u.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (jobIdParam && jobIdParam !== 'active') {
      setResolvedJobId(jobIdParam);
      return;
    }
    (async () => {
      try {
        const res = await apiClient.getFundiActiveJob() as { job?: { id: string } };
        if (res?.job?.id) setResolvedJobId(res.job.id);
        else { toast.error('No active job found'); navigate('/fundi'); }
      } catch {
        navigate('/fundi');
      }
    })();
  }, [jobIdParam, navigate]);

  useEffect(() => {
    if (!token) return;
    realtimeService.connect(token);
  }, [token]);

  useEffect(() => {
    if (!resolvedJobId) return;
    (async () => {
      try {
        const res = await apiClient.getJob(resolvedJobId) as { job?: Job };
        setJob(res.job ?? null);
      } catch { toast.error('Failed to load job'); }
      finally { setLoading(false); }
    })();
  }, [resolvedJobId]);

  useEffect(() => {
    if (!resolvedJobId) return;
    const onStatus = (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== resolvedJobId) return;
      setJob((prev) => prev ? { ...prev, status: payload.status as string } : prev);
    };
    const onConfirmed = (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== resolvedJobId) return;
      setOtpConfirmed(true);
      toast.success('Customer confirmed completion!');
    };
    realtimeService.on('job:status', onStatus);
    realtimeService.on('job:completion:confirmed', onConfirmed);
    return () => {
      realtimeService.off('job:status', onStatus);
      realtimeService.off('job:completion:confirmed', onConfirmed);
    };
  }, [resolvedJobId]);

  const destination = job?.latitude != null && job?.longitude != null
    ? { latitude: Number(job.latitude), longitude: Number(job.longitude) }
    : null;

  const status = job?.status.toLowerCase() || '';
  const shouldTrack = ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(status);

  useEffect(() => {
    if (!resolvedJobId || !shouldTrack || !navigator.geolocation) return;

    const sendPosition = (latitude: number, longitude: number, accuracy?: number) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < 3000) return;
      lastSentAtRef.current = now;
      setFundiPosition({ latitude, longitude });
      apiClient.updateLocation(latitude, longitude, accuracy, resolvedJobId)
        .catch(() => realtimeService.updateLocation(latitude, longitude, accuracy, true, resolvedJobId));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = typeof position.coords.accuracy === 'number'
          ? Math.round(position.coords.accuracy)
          : undefined;
        sendPosition(position.coords.latitude, position.coords.longitude, accuracy);
      },
      () => toast.error('Unable to track your location for navigation'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [resolvedJobId, shouldTrack]);

  const step = async (nextStatus: 'on_the_way' | 'arrived' | 'in_progress') => {
    if (!resolvedJobId) return;
    try {
      const pos = await getCurrentPosition();
      await apiClient.checkInToJob(
        resolvedJobId,
        pos.coords.latitude,
        pos.coords.longitude,
        nextStatus,
      );
      setFundiPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      setJob((prev) => prev ? { ...prev, status: nextStatus } : prev);
      const labels = { on_the_way: 'On the way!', arrived: 'Arrived!', in_progress: 'Work started!' };
      toast.success(labels[nextStatus]);
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      if (err?.status === 401) {
        toast.error('Session expired. Please log in again.');
        navigate('/auth');
      } else if (err?.status === 403) {
        toast.error('Your account may not be approved yet. Wait for admin approval.');
      } else {
        toast.error(err?.message || 'Failed to update status. Check your connection.');
      }
    }
  };

  const onComplete = async () => {
    if (!resolvedJobId || !finalPrice) { toast.error('Enter final price before completing'); return; }
    setCompleting(true);
    try {
      await apiClient.completeJob(resolvedJobId, finalPrice, photos);
      toast.success('Job completed. Waiting for customer OTP confirmation.');
      setJob((prev) => prev ? { ...prev, status: 'completed' } : prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete job');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading job...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-hero">
        <p className="text-muted-foreground">Job not found.</p>
        <Button onClick={() => navigate('/fundi')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      {showChat && resolvedJobId && currentUserId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col">
          <div className="flex-1 max-w-lg mx-auto w-full bg-background shadow-2xl flex flex-col mt-4 rounded-t-3xl overflow-hidden">
            <InAppChat
              jobId={resolvedJobId}
              currentUserId={currentUserId}
              currentUserRole="fundi"
              onClose={() => setShowChat(false)}
            />
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/fundi')} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold">Active Job</h1>
            <p className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={() => setShowChat(true)} className="p-2 hover:bg-muted rounded-xl transition-colors relative">
            <MessageCircle className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {destination && shouldTrack && (
          <FundiNavigationMap
            fundiPosition={fundiPosition}
            destination={destination}
            destinationLabel={sanitizeLocationText(job.location, LOCATION_FALLBACK)}
            height={380}
          />
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-5 border border-border/50">
          <p className="font-bold text-lg">{job.title}</p>
          <p className="text-muted-foreground text-sm mt-1">{job.description}</p>
          <div className="flex items-center gap-3 mt-4">
            <div className="min-w-0 flex-1">
              <AddressDisplay fallback={sanitizeLocationText(job.location, LOCATION_FALLBACK)} compact />
            </div>
            {job.estimatedPrice != null && (
              <div className="flex items-center gap-1.5 text-sm ml-auto shrink-0">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="font-semibold text-primary">KES {Number(job.estimatedPrice).toFixed(0)}</span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowChat(true)}
            className="flex flex-col items-center gap-1.5 p-3 bg-card rounded-2xl border border-border/50 hover:bg-primary/5 transition-colors"
          >
            <MessageCircle className="w-5 h-5 text-blue-500" />
            <span className="text-xs font-medium">Chat</span>
          </button>
          <button
            onClick={() => toast.info('Call feature via customer phone — coming soon')}
            className="flex flex-col items-center gap-1.5 p-3 bg-card rounded-2xl border border-border/50 hover:bg-primary/5 transition-colors"
          >
            <Phone className="w-5 h-5 text-green-500" />
            <span className="text-xs font-medium">Call</span>
          </button>
        </div>

        {status !== 'completed' && (
          <div className="bg-card rounded-2xl p-5 border border-border/50 space-y-4">
            <h3 className="font-semibold">Job Controls</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'En Route', nextStatus: 'on_the_way' as const, active: status === 'on_the_way' },
                { label: 'Arrived', nextStatus: 'arrived' as const, active: status === 'arrived' },
                { label: 'Start Work', nextStatus: 'in_progress' as const, active: status === 'in_progress' },
              ].map(({ label, nextStatus, active }) => (
                <button
                  key={nextStatus}
                  onClick={() => step(nextStatus)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                    active ? 'bg-primary text-white shadow-glow' : 'bg-muted text-foreground hover:bg-primary/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {status === 'in_progress' && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Final Price (KES)</label>
                  <input
                    type="number"
                    value={finalPrice}
                    onChange={(e) => setFinalPrice(e.target.value)}
                    placeholder="Enter total amount charged"
                    className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Completion Photos</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors w-full justify-center"
                  >
                    <Camera className="w-4 h-4" />
                    {photos.length > 0 ? `${photos.length} photo(s) selected` : 'Add Photos (optional)'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => setPhotos(Array.from(e.target.files || []))}
                  />
                </div>

                <Button
                  onClick={onComplete}
                  disabled={completing || !finalPrice}
                  className="w-full bg-gradient-primary"
                >
                  {completing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Completing...</> : 'Complete Job'}
                </Button>
              </div>
            )}
          </div>
        )}

        {status === 'completed' && (
          <div className={`rounded-2xl p-5 border ${otpConfirmed ? 'bg-green-50 border-green-200' : 'bg-muted/50 border-border/50'}`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`w-6 h-6 ${otpConfirmed ? 'text-green-600' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-semibold text-sm">
                  {otpConfirmed ? 'Customer confirmed completion!' : 'Waiting for customer OTP'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {otpConfirmed
                    ? 'Payment will be released to your wallet after the dispute window.'
                    : 'The customer must enter their OTP to confirm the job is done.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
