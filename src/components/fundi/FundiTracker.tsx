import React, { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  X, ShieldCheck, Star, Wrench, MessageCircle,
  Smartphone, CheckCircle, Loader2, AlertCircle,
  Lock, ArrowRight, RefreshCw,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { isValidUuid } from "@/lib/uuid";
import { realtimeService } from "@/services/realtime";
import LiveTrackingMap from "@/components/maps/LiveTrackingMap";
import SearchingRadarMap from "@/components/maps/SearchingRadarMap";
import AddressDisplay from "@/components/maps/AddressDisplay";
import { useDirections } from "@/hooks/useDirections";
import { useAnimatedPosition } from "@/hooks/useAnimatedPosition";
import { useStructuredAddress } from "@/hooks/useStructuredAddress";
import { formatAddressLines, sanitizeLocationText, LOCATION_FALLBACK } from '@/lib/maps/geocoding';
import "./fundi-tracker.css";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { toast } from "sonner";
import InAppChat from "@/components/chat/InAppChat";
import TrustBadge from "@/components/ui/TrustBadge";

interface FundiInfo {
  id: string;
  name: string;
  skill: string;
  distanceKm: number;
  rating: number;
  avatarUrl?: string;
  trustScore?: number;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

type Status =
  | "searching" | "matching" | "matched" | "accepted"
  | "on_the_way" | "arrived" | "in_progress"
  | "completed" | "cancelled" | "failed";

type PaymentStatus = "idle" | "processing" | "initiated" | "polling" | "confirmed" | "failed";

function normalizeJobStatus(raw?: string): Status {
  const s = String(raw || "").toLowerCase().trim();
  if (!s || ["requested", "pending", "matching", "searching"].includes(s)) return "searching";
  if (s === "matched") return "matched";
  if (s === "accepted") return "accepted";
  if (s === "on_the_way") return "on_the_way";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "failed") return "failed";
  return "searching";
}

function toCoordinates(source: Record<string, unknown>, latKeys: string[], lonKeys: string[]): Coordinates | null {
  const latitude = latKeys.map((key) => Number(source[key])).find(Number.isFinite);
  const longitude = lonKeys.map((key) => Number(source[key])).find(Number.isFinite);
  if (latitude === undefined || longitude === undefined) return null;
  return { latitude, longitude };
}

function distanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function etaMinutes(km: number): number {
  const citySpeedKmh = 22;
  return Math.max(1, Math.ceil((km / citySpeedKmh) * 60));
}

export default function FundiTracker({
  onComplete,
  jobId,
}: {
  onComplete?: () => void;
  jobId?: string;
}) {
  const [jobStatusRaw, setJobStatusRaw] = useState<string>("searching");
  const status = normalizeJobStatus(jobStatusRaw);
  const [fundi, setFundi] = useState<FundiInfo | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState("Finding nearby fundi...");
  const [hasAuth, setHasAuth] = useState(() => Boolean(localStorage.getItem("auth_token")));
  const [accessError, setAccessError] = useState<string | null>(null);
  const [customerLocation, setCustomerLocation] = useState<Coordinates | null>(null);
  const [customerAddress, setCustomerAddress] = useState<string>("");
  const [fundiLocation, setFundiLocation] = useState<Coordinates | null>(null);
  const [lastLocationAt, setLastLocationAt] = useState<string | null>(null);
  const [arrivalNotified, setArrivalNotified] = useState(false);

  // OTP state
  const [completionOtp, setCompletionOtp] = useState("");
  const [confirmingOtp, setConfirmingOtp] = useState(false);
  const [completionConfirmed, setCompletionConfirmed] = useState(false);

  // Payment state
  const [mpesaNumber, setMpesaNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [paymentMsg, setPaymentMsg] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [paymentPollingCount, setPaymentPollingCount] = useState(0);

  // Review state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // UI state
  const [showChat, setShowChat] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);

  const blockBackRef = useRef<boolean>(false);
  const paymentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load current user for chat
  useEffect(() => {
    apiClient.getCurrentUser().then((res) => {
      const u = res?.user as { id: string } | undefined;
      if (u) setCurrentUser(u);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setHasAuth(false);
      return;
    }
    if (!jobId || !isValidUuid(jobId)) {
      setHasAuth(false);
      setAccessError(jobId ? "This job link is invalid." : "No job selected.");
      return;
    }
    setHasAuth(true);
    setAccessError(null);
  }, [jobId]);

  // Prevent back during active search
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (blockBackRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    blockBackRef.current = ["searching", "matching", "matched", "accepted"].includes(status);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  // Stop payment polling on unmount
  useEffect(() => {
    return () => {
      if (paymentPollRef.current) clearInterval(paymentPollRef.current);
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, []);

  // Load job and start polling
  useEffect(() => {
    if (!hasAuth || !jobId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) { setJobStatusRaw("failed"); return; }

    // Connect realtime (polling-based)
    realtimeService.connect(token);

    // Listen to realtime events
    const onAccepted = (data: Record<string, unknown>) => {
      if (data.jobId && data.jobId !== jobId) return;
      setJobStatusRaw("accepted");
      if (data.estimatedPrice) {
        const p = Number(data.estimatedPrice);
        if (Number.isFinite(p)) { setEstimatedPrice(p); setPaymentAmount(p); }
      }
      if (data.fundiId && !fundi) loadFundi(data.fundiId as string);
    };

    const onCompleted = (data: Record<string, unknown>) => {
      if (data.jobId && data.jobId !== jobId) return;
      setJobStatusRaw("completed");
    };

    const onPaymentConfirmed = (data: Record<string, unknown>) => {
      if (data.jobId && data.jobId !== jobId) return;
      setPaymentStatus("confirmed");
      setPaymentMsg("Payment confirmed! Your fundi will receive their payout shortly.");
      if (paymentPollRef.current) { clearInterval(paymentPollRef.current); paymentPollRef.current = null; }
      toast.success("Payment confirmed via M-Pesa!");
    };

    const onPaymentFailed = (data: Record<string, unknown>) => {
      if (data.jobId && data.jobId !== jobId) return;
      setPaymentStatus("failed");
      setPaymentMsg(String(data.message || "Payment failed. Please try again."));
      toast.error("Payment failed.");
    };

    const onFundiLocation = (data: Record<string, unknown>) => {
      if (data.jobId && data.jobId !== jobId) return;
      const next = toCoordinates(data, ["latitude", "lat"], ["longitude", "lng", "lon"]);
      if (!next) return;
      setFundiLocation(next);
      setLastLocationAt(String(data.recordedAt || new Date().toISOString()));
    };

    realtimeService.on("job:accepted", onAccepted);
    realtimeService.on("job:completed", onCompleted);
    realtimeService.on("payment:confirmed", onPaymentConfirmed);
    realtimeService.on("payment:failed", onPaymentFailed);
    realtimeService.on("fundi:location:update", onFundiLocation);

    // Start watching job (polling)
    realtimeService.watchJob(jobId);

    // Initial fetch
    loadJob();

    // Also poll job every 6s
    jobPollRef.current = setInterval(loadJob, 6000);

    return () => {
      realtimeService.off("job:accepted", onAccepted);
      realtimeService.off("job:completed", onCompleted);
      realtimeService.off("payment:confirmed", onPaymentConfirmed);
      realtimeService.off("payment:failed", onPaymentFailed);
      realtimeService.off("fundi:location:update", onFundiLocation);
      realtimeService.stopWatchingJob(jobId);
      if (jobPollRef.current) clearInterval(jobPollRef.current);
      if (paymentPollRef.current) clearInterval(paymentPollRef.current);
    };
  }, [hasAuth, jobId]);

  const stopJobPolling = () => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
    if (jobId) realtimeService.stopWatchingJob(jobId);
  };

  const loadJob = async () => {
    if (!jobId || !isValidUuid(jobId)) {
      setAccessError("This job link is invalid.");
      stopJobPolling();
      return;
    }
    try {
      const res = await apiClient.getJob(jobId) as { job?: Record<string, unknown> };
      if (res?.job) {
        const job = res.job;
        setJobStatusRaw((job.status as string) || "searching");
        if (job.estimated_price != null) {
          const p = Number(job.estimated_price);
          if (Number.isFinite(p)) { setEstimatedPrice(p); setPaymentAmount(p); }
        }
        if (job.final_price != null) {
          const fp = Number(job.final_price);
          if (Number.isFinite(fp)) { setPaymentAmount(fp); }
        }
        if (job.customer_completion_confirmed) setCompletionConfirmed(true);
        if (job.fundi_id && !fundi) loadFundi(job.fundi_id as string);
        const customerCoords = toCoordinates(
          job,
          ["customer_latitude", "latitude", "lat"],
          ["customer_longitude", "longitude", "lng", "lon"],
        );
        if (customerCoords) setCustomerLocation(customerCoords);
        const rawLocation = String(job.location_name || job.address || job.customer_address || "");
        setCustomerAddress(sanitizeLocationText(rawLocation, ""));
        const liveFundiCoords = toCoordinates(
          job,
          ["fundi_latitude", "fundi_lat", "last_fundi_latitude"],
          ["fundi_longitude", "fundi_lng", "fundi_lon", "last_fundi_longitude"],
        );
        if (liveFundiCoords) setFundiLocation(liveFundiCoords);
        
        const status = (job.status as string || "").toLowerCase();
        const msgMap: Record<string, string> = {
          pending: "Searching for nearby fundis...",
          matching: "Matching with available fundis...",
          accepted: "Fundi accepted your request!",
          on_the_way: "Your fundi is on the way!",
          arrived: "Your fundi has arrived!",
          in_progress: "Work in progress...",
          completed: "Job completed! Please confirm.",
        };
        if (msgMap[status]) setProgressMsg(msgMap[status]);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 400)) {
        setAccessError(e.message || "Not allowed to access this job");
        stopJobPolling();
        return;
      }
      console.error("[FundiTracker] loadJob error:", e);
    }
  };

  const loadFundi = async (fundiId: string) => {
    try {
      const fundiRes = await apiClient.getFundi(fundiId) as { fundi?: Record<string, unknown> };
      if (fundiRes?.fundi) {
        const f = fundiRes.fundi;
        setFundi({
          id: f.id as string,
          name: `${f.first_name} ${f.last_name}`,
          skill: (f.skills as string[])?.[0] || "Fundi",
          distanceKm: 0,
          rating: (f.rating as number) || 4.5,
          avatarUrl: (f.avatar_url) as string | undefined,
          trustScore: (f.trust_score as number) || undefined,
        });
      }
    } catch { /* ignore */ }
  };

  const handleConfirmCompletion = async () => {
    if (!jobId || completionOtp.length < 4) return;
    setConfirmingOtp(true);
    try {
      await apiClient.confirmJobCompletion(jobId, completionOtp);
      setCompletionConfirmed(true);
      toast.success("Completion confirmed! Proceed to payment.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm. Check your OTP.");
    } finally {
      setConfirmingOtp(false);
    }
  };

  const startPaymentPolling = (jobIdToCheck: string) => {
    if (paymentPollRef.current) clearInterval(paymentPollRef.current);
    let count = 0;
    paymentPollRef.current = setInterval(async () => {
      count++;
      setPaymentPollingCount(count);
      if (count > 30) {
        clearInterval(paymentPollRef.current!);
        paymentPollRef.current = null;
        setPaymentStatus("failed");
        setPaymentMsg("Payment confirmation timed out. If you paid, contact support with your M-Pesa code.");
        return;
      }
      try {
        const result = await apiClient.getPaymentForJob(jobIdToCheck) as {
          payment?: { status?: string };
        };
        const payStatus = result?.payment?.status?.toLowerCase();
        if (payStatus === "completed" || payStatus === "confirmed") {
          clearInterval(paymentPollRef.current!);
          paymentPollRef.current = null;
          setPaymentStatus("confirmed");
          setPaymentMsg("Payment confirmed! Your fundi will receive their payout shortly.");
          toast.success("Payment confirmed!");
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const handlePayment = async () => {
    if (!jobId) return;
    const cleaned = mpesaNumber.trim().replace(/\s/g, "");
    if (!cleaned) { toast.error("Please enter your M-Pesa number"); return; }
    if (!/^(07|01|\+2547|\+2541|2547|2541)\d{7,8}$/.test(cleaned)) {
      toast.error("Please enter a valid Kenyan M-Pesa number (e.g. 0712345678)");
      return;
    }
    setPaymentStatus("processing");
    setPaymentMsg("");
    try {
      await apiClient.processPayment(jobId, cleaned);
      setPaymentStatus("initiated");
      setPaymentMsg("M-Pesa STK push sent to your phone. Open your M-Pesa menu and enter your PIN.");
      startPaymentPolling(jobId);
    } catch (e) {
      setPaymentStatus("failed");
      const msg = e instanceof Error ? e.message : "Payment initiation failed. Please try again.";
      setPaymentMsg(msg);
      toast.error(msg);
    }
  };

  const handleRetryPayment = () => {
    setPaymentStatus("idle");
    setPaymentMsg("");
    setPaymentPollingCount(0);
    if (paymentPollRef.current) { clearInterval(paymentPollRef.current); paymentPollRef.current = null; }
  };

  const handleSubmitReview = async () => {
    if (!jobId) return;
    try {
      await apiClient.submitReview(jobId, reviewRating, reviewComment);
      setReviewSubmitted(true);
      toast.success("Review submitted! Thank you.");
      if (onComplete) onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review");
    }
  };

  const animatedFundiLocation = useAnimatedPosition(fundiLocation);
  const trackingActive = ["accepted", "on_the_way", "arrived", "in_progress"].includes(status);
  const { directions, routePath } = useDirections(
    fundiLocation,
    customerLocation,
    trackingActive && Boolean(fundiLocation && customerLocation),
  );
  const { address: resolvedCustomerAddress } = useStructuredAddress(
    customerLocation,
    customerAddress || '',
  );
  const fallbackDistanceKm = customerLocation && fundiLocation ? distanceKm(fundiLocation, customerLocation) : null;
  const routeDistanceKm = directions?.distanceKm ?? fallbackDistanceKm;
  const routeEta = directions?.etaMinutes ?? (fallbackDistanceKm == null ? null : etaMinutes(fallbackDistanceKm));
  const hasArrived = routeDistanceKm != null && routeDistanceKm <= 0.05;
  const showSearchingMap = ["searching", "matching", "matched"].includes(status) && customerLocation;
  const showTrackingMap = fundi && trackingActive && customerLocation;

  useEffect(() => {
    if (!hasArrived || arrivalNotified || !jobId) return;
    setArrivalNotified(true);
    realtimeService.emit("fundi:arrived", { jobId, distanceMeters: Math.round((routeDistanceKm || 0) * 1000) });
    toast.success("Your fundi has arrived.");
  }, [arrivalNotified, hasArrived, jobId, routeDistanceKm]);

  if (accessError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-muted-foreground max-w-sm">{accessError}</p>
        <Button onClick={() => (window.location.href = "/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  if (!hasAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center gap-4">
        <p className="text-muted-foreground">Please log in to track your job.</p>
        <Button onClick={() => (window.location.href = "/auth")}>Sign In</Button>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    searching: "Searching for Fundi",
    matching: "Matching Fundis",
    matched: "Fundi Found",
    accepted: "Fundi Accepted",
    on_the_way: "Fundi On The Way",
    arrived: "Fundi Arrived",
    in_progress: "Work In Progress",
    completed: "Job Completed",
    cancelled: "Job Cancelled",
    failed: "Search Failed",
  };

  const statusColor: Record<string, string> = {
    searching: "text-blue-600", matching: "text-blue-600",
    matched: "text-purple-600", accepted: "text-purple-600",
    on_the_way: "text-orange-600", arrived: "text-orange-600",
    in_progress: "text-green-600", completed: "text-green-700",
    cancelled: "text-red-600", failed: "text-red-600",
  };

  const statusBg: Record<string, string> = {
    searching: "bg-blue-50", matching: "bg-blue-50",
    matched: "bg-purple-50", accepted: "bg-purple-50",
    on_the_way: "bg-orange-50", arrived: "bg-orange-50",
    in_progress: "bg-green-50", completed: "bg-green-50",
    cancelled: "bg-red-50", failed: "bg-red-50",
  };

  const progressSteps = ["Searching", "Accepted", "On the Way", "Arrived", "In Progress", "Done"];
  const stepIndex: Record<string, number> = {
    searching: 0, matching: 0, matched: 1, accepted: 1,
    on_the_way: 2, arrived: 3, in_progress: 4, completed: 5,
  };
  const currentStep = stepIndex[status] ?? 0;

  return (
    <div className="min-h-screen bg-gradient-hero p-4 md:p-6">
      {showChat && jobId && currentUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col">
          <div className="flex-1 max-w-lg mx-auto w-full bg-background shadow-2xl flex flex-col mt-4 rounded-t-3xl overflow-hidden">
            <InAppChat jobId={jobId} currentUserId={currentUser.id} currentUserRole="customer" onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-4">
        {(showSearchingMap || showTrackingMap) && (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-md">
            {showSearchingMap && customerLocation && (
              <SearchingRadarMap center={customerLocation} height={380} />
            )}
            {showTrackingMap && customerLocation && (
              <LiveTrackingMap
                customer={customerLocation}
                fundi={animatedFundiLocation}
                routePath={routePath}
                height={380}
                overlay={(
                  <div className="pf-map-overlay-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live ETA</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {routeEta ? `${routeEta} min` : "Waiting for GPS"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remaining</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km` : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
            <div className="space-y-3 p-4">
              <AddressDisplay
                address={resolvedCustomerAddress}
                fallback={customerAddress || LOCATION_FALLBACK}
              />
              {lastLocationAt && (
                <p className="text-xs text-muted-foreground">
                  Last fundi update {new Date(lastLocationAt).toLocaleTimeString()}
                </p>
              )}
              {hasArrived && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                  Your fundi has arrived.
                </div>
              )}
            </div>
          </div>
        )}
        {/* Main status card */}
        <div className="bg-card rounded-2xl shadow-md border border-border/50 overflow-hidden">
          <div className={`px-6 pt-6 pb-4 ${statusBg[status] || "bg-card"}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-bold text-xl">Job Tracking</h2>
              {onComplete && (
                <button onClick={onComplete} className="p-2 hover:bg-black/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className={`text-base font-semibold ${statusColor[status] || "text-foreground"}`}>
              {statusLabel[status] || status}
            </div>
          </div>

          {!["cancelled", "failed"].includes(status) && (
            <div className="px-6 py-3 bg-card border-b border-border/30">
              <div className="flex items-center justify-between gap-1">
                {progressSteps.map((step, idx) => (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                        idx < currentStep ? "bg-primary" :
                        idx === currentStep ? "bg-primary ring-4 ring-primary/20" : "bg-muted"
                      }`} />
                      <span className={`text-[9px] font-medium ${idx <= currentStep ? "text-primary" : "text-muted-foreground"}`}>
                        {step}
                      </span>
                    </div>
                    {idx < progressSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mb-3 ${idx < currentStep ? "bg-primary" : "bg-muted"}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 pb-6 pt-4 space-y-4">
            {["searching", "matching"].includes(status) && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">{progressMsg}</p>
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

            {(status === "failed") && (
              <div className="space-y-3">
                <p className="text-destructive text-sm">{progressMsg || "No fundis found nearby."}</p>
                <Button variant="outline" onClick={() => window.location.reload()} className="w-full gap-2">
                  <RefreshCw className="w-4 h-4" /> Try Again
                </Button>
              </div>
            )}

            {status === "cancelled" && (
              <p className="text-muted-foreground text-sm">This job has been cancelled.</p>
            )}

            {fundi && ["matched", "accepted", "on_the_way", "arrived", "in_progress", "completed"].includes(status) && (
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{fundi.name}</p>
                      {fundi.trustScore != null && <TrustBadge score={fundi.trustScore} size="sm" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{fundi.skill}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{fundi.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  {jobId && currentUser && (
                    <button onClick={() => setShowChat(true)} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
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
        {status === "completed" && !completionConfirmed && (
          <div className="bg-card rounded-2xl p-6 shadow-md border border-border/50 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Confirm Job Completion</h3>
                <p className="text-xs text-muted-foreground">Step 1 of 2 — Verify with OTP</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Enter the OTP provided by your fundi to confirm completion.</p>
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
            <Button className="w-full bg-gradient-primary" onClick={handleConfirmCompletion} disabled={completionOtp.length < 4 || confirmingOtp}>
              {confirmingOtp ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : <><ShieldCheck className="w-4 h-4 mr-2" /> Confirm Completion</>}
            </Button>
          </div>
        )}

        {/* Escrow Payment */}
        {completionConfirmed && paymentStatus !== "confirmed" && (
          <div className="bg-card rounded-2xl shadow-md border border-border/50 overflow-hidden">
            <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-green-50 to-emerald-50 border-b border-green-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-green-900">Pay via M-Pesa</h3>
                  <p className="text-xs text-green-700">Step 2 of 2 — Secure escrow payment</p>
                </div>
              </div>
              {(paymentAmount ?? estimatedPrice) != null && (
                <div className="bg-white rounded-xl p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-green-700">KES {(paymentAmount ?? estimatedPrice)!.toFixed(0)}</p>
                  <p className="text-xs text-gray-500 mt-1">Held in secure escrow · Released to fundi after review</p>
                </div>
              )}
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Protected by PataFundi Escrow</p>
                  <p className="text-xs text-blue-700 mt-0.5">Your payment is held securely until the fundi payout is approved.</p>
                </div>
              </div>

              {(paymentStatus === "idle" || paymentStatus === "failed") && (
                <div className="space-y-4">
                  {paymentStatus === "failed" && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-700">{paymentMsg}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold mb-2">M-Pesa Number</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">🇰🇪</div>
                      <input
                        type="tel"
                        value={mpesaNumber}
                        onChange={(e) => setMpesaNumber(e.target.value)}
                        placeholder="0712 345 678"
                        className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                        maxLength={13}
                      />
                    </div>
                  </div>
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold gap-2" onClick={handlePayment}>
                    Pay KES {(paymentAmount ?? estimatedPrice ?? 0).toFixed(0)} Now <ArrowRight className="w-4 h-4" />
                  </Button>
                  {paymentStatus === "failed" && (
                    <Button variant="ghost" className="w-full text-sm" onClick={handleRetryPayment}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                    </Button>
                  )}
                </div>
              )}

              {paymentStatus === "processing" && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
                  <p className="text-sm font-semibold">Initiating M-Pesa payment...</p>
                </div>
              )}

              {paymentStatus === "initiated" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="relative w-16 h-16">
                      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                        <Smartphone className="w-8 h-8 text-green-600" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-4 border-green-200 border-t-green-600 animate-spin" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-base text-green-800">Check Your Phone</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        STK push sent to <strong>{mpesaNumber}</strong>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Waiting for confirmation{paymentPollingCount > 0 ? ` (${paymentPollingCount * 5}s)` : ""}...
                  </p>
                  <Button variant="outline" className="w-full text-sm" onClick={handleRetryPayment}>
                    Didn&apos;t receive it? Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Confirmed → Review */}
        {paymentStatus === "confirmed" && !reviewSubmitted && fundi && (
          <div className="bg-card rounded-2xl p-6 shadow-md border border-border/50 space-y-5">
            <div className="flex flex-col items-center gap-2 pb-4 border-b border-border/50">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="font-bold text-green-800 text-base">Payment Received!</p>
              <p className="text-xs text-muted-foreground text-center">{paymentMsg}</p>
            </div>
            <h3 className="font-semibold text-lg">Rate Your Fundi</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => setReviewRating(r)}
                  className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all ${
                    r <= reviewRating ? "bg-yellow-400 text-white scale-105" : "bg-muted text-muted-foreground hover:bg-yellow-100"
                  }`}>
                  <Star className="w-5 h-5" fill={r <= reviewRating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share your experience (optional)..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              rows={3}
            />
            <Button className="w-full bg-gradient-primary h-12" onClick={handleSubmitReview}>
              Submit Review & Finish
            </Button>
          </div>
        )}

        {reviewSubmitted && (
          <div className="bg-card rounded-2xl p-8 shadow-md border border-border/50 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-xl">All Done!</h3>
            <p className="text-muted-foreground text-sm">Thank you for using PataFundi.</p>
            <Button onClick={() => (window.location.href = "/dashboard")} className="bg-gradient-primary">
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
