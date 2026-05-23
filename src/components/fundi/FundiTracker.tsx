import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, ShieldCheck, Star, Wrench, MessageCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/lib/api';
import './fundi-tracker.css';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import InAppChat from '@/components/chat/InAppChat';

// CRITICAL: Use VITE_SOCKET_URL — no localhost fallback
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

interface FundiInfo {
  id: string;
  name: string;
  skill: string;
  distanceKm: number;
  rating: number;
  avatarUrl?: string;
}

type Status =
  | 'searching'
  | 'matching'
  | 'matched'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

function normalizeJobStatus(raw?: string): Status {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return 'searching';
  if (['requested', 'pending', 'matching', 'searching'].includes(s)) return 'searching';
  if (s === 'matched') return 'matched';
  if (s === 'accepted') return 'accepted';
  if (s === 'on_the_way') return 'on_the_way';
  if (s === 'arrived') return 'arrived';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'failed') return 'failed';
  return 'searching';
}

export default function FundiTracker({
  onComplete,
  jobId,
}: {
  onComplete?: () => void;
  jobId?: string;
}) {
  const [jobStatusRaw, setJobStatusRaw] = useState<string>('searching');
  const status = normalizeJobStatus(jobStatusRaw);
  const [fundi, setFundi] = useState<FundiInfo | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [searchFailed, setSearchFailed] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState('Finding nearby fundi...');
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(null);
  const [hasAuth, setHasAuth] = useState<boolean>(true);
  const [completionOtp, setCompletionOtp] = useState('');
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'initiated' | 'confirmed' | 'failed'>('idle');
  const [paymentMsg, setPaymentMsg] = useState<string>('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const blockBackRef = useRef<boolean>(false);

  // Load current user for chat
  useEffect(() => {
    apiClient.getCurrentUser().then((res) => {
      const u = res?.user as { id: string } | undefined;
      if (u) setCurrentUser(u);
    }).catch(() => {});
  }, []);

  // Check auth
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token || !jobId) setHasAuth(false);
  }, [jobId]);

  // Prevent back during active search
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (blockBackRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    blockBackRef.current = ['searching', 'matching', 'matched', 'accepted'].includes(status);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // Socket initialization
  useEffect(() => {
    if (!hasAuth || !jobId) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setJobStatusRaw('failed');
      return;
    }

    if (!SOCKET_URL) {
      console.error('[FundiTracker] VITE_SOCKET_URL is not configured.');
      setJobStatusRaw('failed');
      setProgressMsg('Real-time connection unavailable. Please check environment configuration.');
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[FundiTracker] Socket connected');
      socket.emit('auth:token', token);
    });

    socket.on('auth:ok', () => {
      console.log('[FundiTracker] Authenticated');
      setProgressMsg('Searching for nearby fundis...');
    });

    socket.on('auth:error', () => {
      setJobStatusRaw('failed');
      setProgressMsg('Authentication failed. Please refresh.');
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[FundiTracker] Connection error:', err.message);
      setProgressMsg('Connection error. Retrying...');
    });

    socket.on('job:matching', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setSearchFailed(false);
      setJobStatusRaw('matching');
      const count = Array.isArray(payload.candidates) ? payload.candidates.length : null;
      const radius = payload.radiusKm != null ? Number(payload.radiusKm) : null;
      const price = payload.estimatedPrice != null ? Number(payload.estimatedPrice) : null;
      if (Number.isFinite(radius)) setSearchRadiusKm(radius);
      if (Number.isFinite(price)) setEstimatedPrice(price);
      setProgressMsg(
        count && radius ? `Notifying ${count} fundis within ${radius} km...`
        : count ? `Notifying ${count} nearby fundis...`
        : radius ? `Searching within ${radius} km...`
        : 'Notifying nearby fundis...'
      );
    });

    socket.on('job:matched', async (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setJobStatusRaw('matched');
      try {
        const fundiRes = await apiClient.getFundi(payload.fundiId as string) as { fundi?: Record<string, unknown> };
        if (fundiRes?.fundi) {
          const f = fundiRes.fundi;
          setFundi({
            id: f.id as string,
            name: `${f.firstName} ${f.lastName}`,
            skill: (f.skills as string[])?.[0] || 'Fundi',
            distanceKm: payload.distanceKm ? Number(payload.distanceKm) : 0,
            rating: (f.rating as number) || 4.5,
            avatarUrl: (f.avatarUrl || f.avatar_url) as string | undefined,
          });
        }
      } catch { /* ignore */ }
    });

    socket.on('job:accepted', async (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setSearchFailed(false);
      setJobStatusRaw('accepted');
      if (payload.estimatedPrice != null) {
        const p = Number(payload.estimatedPrice);
        if (Number.isFinite(p)) setEstimatedPrice(p);
      }
      if (payload.fundiId && !fundi) {
        try {
          const fundiRes = await apiClient.getFundi(payload.fundiId as string) as { fundi?: Record<string, unknown> };
          if (fundiRes?.fundi) {
            const f = fundiRes.fundi;
            setFundi({
              id: f.id as string,
              name: `${f.firstName} ${f.lastName}`,
              skill: (f.skills as string[])?.[0] || 'Fundi',
              distanceKm: payload.distanceKm ? Number(payload.distanceKm) : 0,
              rating: (f.rating as number) || 4.5,
            });
          }
        } catch { /* ignore */ }
      }
    });

    socket.on('job:status', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setJobStatusRaw(payload.status as string);
    });

    socket.on('job:rejected', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setJobStatusRaw('matching');
      setProgressMsg('Finding another fundi...');
    });

    socket.on('job:cancelled', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setJobStatusRaw('cancelled');
    });

    socket.on('job:search:failed', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setSearchFailed(true);
      setJobStatusRaw('failed');
      setProgressMsg('No fundis found nearby. Try again in a few minutes.');
    });

    socket.on('job:completed', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setJobStatusRaw('completed');
      setPaymentMsg((payload.message as string) || 'Job completed. Please confirm and pay.');
    });

    socket.on('job:completion:confirmed', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setCompletionConfirmed(true);
    });

    socket.on('payment:confirmed', (payload: Record<string, unknown>) => {
      if (!payload || payload.jobId !== jobId) return;
      setPaymentStatus('confirmed');
      setPaymentMsg('Payment confirmed! Thank you.');
    });

    // Fetch initial job state
    (async () => {
      if (!jobId) return;
      try {
        const res = await apiClient.getJob(jobId) as { job?: Record<string, unknown> };
        if (res?.job) {
          const job = res.job;
          setJobStatusRaw((job.status as string) || 'searching');
          if (job.estimated_price != null) {
            const p = Number(job.estimated_price);
            if (Number.isFinite(p)) setEstimatedPrice(p);
          }
          if (job.customer_completion_confirmed) setCompletionConfirmed(true);
        }
      } catch (e) {
        console.error('[FundiTracker] Failed to fetch job:', e);
      }
    })();

    return () => {
      socket.disconnect();
    };
  }, [hasAuth, jobId]);

  const handleConfirmCompletion = async () => {
    if (!jobId || completionOtp.length < 4) return;
    try {
      await apiClient.confirmJobCompletion(jobId, completionOtp);
      setCompletionConfirmed(true);
      toast.success('Completion confirmed!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to confirm completion');
    }
  };

  const handlePayment = async () => {
    if (!jobId) return;
    if (!mpesaNumber.trim()) {
      toast.error('Please enter your M-Pesa number');
      return;
    }
    setPaymentStatus('processing');
    try {
      await apiClient.processPayment(jobId, mpesaNumber);
      setPaymentStatus('initiated');
      setPaymentMsg('M-Pesa STK push sent to your phone. Check your phone and enter PIN to complete payment.');
    } catch (e) {
      setPaymentStatus('failed');
      const msg = e instanceof Error ? e.message : 'Payment initiation failed';
      setPaymentMsg(msg);
      toast.error(msg);
    }
  };

  const handleSubmitReview = async () => {
    if (!jobId) return;
    try {
      await apiClient.submitReview(jobId, reviewRating, reviewComment);
      setReviewSubmitted(true);
      toast.success('Review submitted! Thank you.');
      if (onComplete) onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit review');
    }
  };

  if (!hasAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center gap-4">
        <p className="text-muted-foreground">Please log in to track your job.</p>
        <Button onClick={() => window.location.href = '/auth'}>Sign In</Button>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    searching: 'Searching for Fundi',
    matching: 'Matching Fundis',
    matched: 'Fundi Found',
    accepted: 'Fundi Accepted',
    on_the_way: 'Fundi On The Way',
    arrived: 'Fundi Arrived',
    in_progress: 'Work In Progress',
    completed: 'Job Completed',
    cancelled: 'Job Cancelled',
    failed: 'Search Failed',
  };

  const statusColor: Record<string, string> = {
    searching: 'text-blue-600',
    matching: 'text-blue-600',
    matched: 'text-purple-600',
    accepted: 'text-purple-600',
    on_the_way: 'text-orange-600',
    arrived: 'text-orange-600',
    in_progress: 'text-green-600',
    completed: 'text-green-700',
    cancelled: 'text-red-600',
    failed: 'text-red-600',
  };

  const statusBg: Record<string, string> = {
    searching: 'bg-blue-50',
    matching: 'bg-blue-50',
    matched: 'bg-purple-50',
    accepted: 'bg-purple-50',
    on_the_way: 'bg-orange-50',
    arrived: 'bg-orange-50',
    in_progress: 'bg-green-50',
    completed: 'bg-green-50',
    cancelled: 'bg-red-50',
    failed: 'bg-red-50',
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-4 md:p-6">
      {/* Chat overlay */}
      {showChat && jobId && currentUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col">
          <div className="flex-1 max-w-lg mx-auto w-full bg-background shadow-2xl flex flex-col mt-4 rounded-t-3xl overflow-hidden">
            <InAppChat
              jobId={jobId}
              currentUserId={currentUser.id}
              currentUserRole="customer"
              onClose={() => setShowChat(false)}
            />
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto space-y-4">
        {/* Main status card */}
        <div className="bg-card rounded-2xl shadow-md border border-border/50 overflow-hidden">
          <div className={`px-6 pt-6 pb-4 ${statusBg[status] || 'bg-card'}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-bold text-xl">Job Tracking</h2>
              {onComplete && (
                <button onClick={onComplete} className="p-2 hover:bg-black/10 rounded-full transition-colors" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className={`text-base font-semibold ${statusColor[status] || 'text-foreground'}`}>
              {statusLabel[status] || status}
            </div>
          </div>

          <div className="px-6 pb-6 pt-4 space-y-4">
            {/* Searching / Matching state */}
            {['searching', 'matching'].includes(status) && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">{progressMsg}</p>
                {searchRadiusKm && (
                  <p className="text-xs text-muted-foreground">Search radius: {searchRadiusKm} km</p>
                )}
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                {estimatedPrice != null && (
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <p className="text-xs text-muted-foreground">Estimated price</p>
                    <p className="font-bold text-primary text-lg">KES {estimatedPrice.toFixed(0)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Failed state */}
            {(status === 'failed' || searchFailed) && (
              <div className="space-y-3">
                <p className="text-destructive text-sm">{progressMsg}</p>
                <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
                  Try Again
                </Button>
              </div>
            )}

            {/* Cancelled */}
            {status === 'cancelled' && (
              <p className="text-muted-foreground text-sm">This job has been cancelled.</p>
            )}

            {/* Fundi card */}
            {fundi && ['matched', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'].includes(status) && (
              <div className="p-4 bg-secondary rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                    {fundi.avatarUrl ? (
                      <img src={fundi.avatarUrl} alt={fundi.name} className="w-full h-full object-cover" />
                    ) : (
                      <Wrench className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{fundi.name}</p>
                    <p className="text-sm text-muted-foreground">{fundi.skill}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{fundi.rating.toFixed(1)}</span>
                      {fundi.distanceKm > 0 && <span>• {fundi.distanceKm.toFixed(1)} km away</span>}
                    </div>
                  </div>
                  {/* Chat button */}
                  {jobId && currentUser && (
                    <button
                      onClick={() => setShowChat(true)}
                      className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      aria-label="Open chat"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {estimatedPrice != null && (
                  <div className="flex justify-between items-center pt-2 border-t border-border/50">
                    <span className="text-sm text-muted-foreground">Estimated price</span>
                    <span className="font-bold text-primary text-lg">KES {estimatedPrice.toFixed(0)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* OTP Confirmation */}
        {status === 'completed' && !completionConfirmed && (
          <div className="bg-card rounded-2xl p-6 shadow-md border border-border/50 space-y-4">
            <h3 className="font-semibold text-lg">Confirm Job Completion</h3>
            {paymentMsg && <p className="text-muted-foreground text-sm">{paymentMsg}</p>}
            <p className="text-sm text-muted-foreground">
              Enter the OTP sent to your email to confirm the job is done.
            </p>
            <InputOTP maxLength={6} value={completionOtp} onChange={setCompletionOtp}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="w-full bg-gradient-primary"
              onClick={handleConfirmCompletion}
              disabled={completionOtp.length < 4}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Confirm Completion
            </Button>
          </div>
        )}

        {/* Payment */}
        {completionConfirmed && paymentStatus !== 'confirmed' && (
          <div className="bg-card rounded-2xl p-6 shadow-md border border-border/50 space-y-4">
            <h3 className="font-semibold text-lg">Pay via M-Pesa</h3>
            {estimatedPrice != null && (
              <p className="text-3xl font-bold text-primary">KES {estimatedPrice.toFixed(0)}</p>
            )}
            {paymentMsg && (
              <p className={`text-sm ${paymentStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {paymentMsg}
              </p>
            )}
            {(paymentStatus === 'idle' || paymentStatus === 'failed') && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">M-Pesa Number</label>
                  <input
                    type="tel"
                    value={mpesaNumber}
                    onChange={(e) => setMpesaNumber(e.target.value)}
                    placeholder="e.g. 0712345678"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  />
                </div>
                <Button className="w-full bg-gradient-primary" onClick={handlePayment}>
                  Pay Now
                </Button>
              </div>
            )}
            {paymentStatus === 'processing' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Initiating M-Pesa payment...</span>
              </div>
            )}
            {paymentStatus === 'initiated' && (
              <div className="p-4 bg-primary/10 rounded-xl">
                <p className="text-sm text-primary font-medium">{paymentMsg}</p>
                <p className="text-xs text-muted-foreground mt-1">This page will update automatically once payment is confirmed.</p>
              </div>
            )}
          </div>
        )}

        {/* Review */}
        {paymentStatus === 'confirmed' && fundi && !reviewSubmitted && (
          <div className="bg-card rounded-2xl p-6 shadow-md border border-border/50 space-y-4">
            <h3 className="font-semibold text-lg">Rate Your Fundi</h3>
            <p className="text-muted-foreground text-sm">How was your experience with {fundi.name}?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => setReviewRating(r)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    r <= reviewRating ? 'bg-yellow-400 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                  aria-label={`${r} star${r > 1 ? 's' : ''}`}
                >
                  <Star className="w-5 h-5" fill={r <= reviewRating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share your experience (optional)..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              rows={3}
              maxLength={500}
            />
            <Button className="w-full bg-gradient-primary" onClick={handleSubmitReview}>
              Submit Review
            </Button>
          </div>
        )}

        {/* Review submitted */}
        {reviewSubmitted && (
          <div className="bg-card rounded-2xl p-8 shadow-md border border-border/50 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-xl">Thank You!</h3>
            <p className="text-muted-foreground text-sm">Your review helps improve the PataFundi platform.</p>
            <Button onClick={() => window.location.href = '/dashboard'} className="bg-gradient-primary">
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
