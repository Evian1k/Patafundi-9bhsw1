import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { realtimeService } from "@/services/realtime";
import { useJobRequest } from "@/hooks/useRealtime";
import {
  BarChart3, Wallet, AlertCircle, TrendingUp, MapPin, LogOut,
  Wifi, WifiOff, Star, ChevronRight, RefreshCw, Scale, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getMaxGpsAccuracyMeters } from "@/lib/gps";
import { JobRequestModal } from "@/components/fundi/JobRequestModal";
import { BrandLogo } from "@/assets/logo";

interface DashboardData {
  verificationStatus: string;
  profileCompletion: number;
  online: boolean;
  walletBalance: number;
  jobStats: { newRequests: number; activeJobs: number; completedJobs: number };
  ratings: { average: number; total: number };
}

export function FundiDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null);
  const [subscriptionDaysLeft, setSubscriptionDaysLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const maxAccuracyMeters = getMaxGpsAccuracyMeters();
  const { jobRequest, remaining, acceptJob, declineJob } = useJobRequest();
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const socketToken = useMemo(() => localStorage.getItem("auth_token"), []);

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const me = await apiClient.getCurrentUser();
      const role = String(me?.user?.role || "").toLowerCase();
      if (role === "customer") { navigate("/dashboard"); return; }
      if (role === "fundi_pending") { navigate("/fundi/pending"); return; }

      const response = await apiClient.getFundiDashboard() as { dashboard?: DashboardData };
      setDashboard(response.dashboard || null);

      try {
        const st = await apiClient.getFundiStatus() as { status?: Record<string, unknown> };
        if (st?.status) {
          setIsOnline(Boolean(st.status.online));
          setSubscriptionActive(Boolean(st.status.subscriptionActive));
          setSubscriptionDaysLeft(typeof st.status.daysLeft === "number" ? st.status.daysLeft : null);
        }
      } catch { /* ignore status fetch errors */ }
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 401) { apiClient.setToken(null); navigate("/auth"); return; }
      if (status === 403) { navigate("/fundi/pending"); return; }
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    if (!socketToken) return;
    realtimeService.connect(socketToken);
  }, [socketToken]);

  useEffect(() => {
    const onOk = (data: Record<string, unknown>) => {
      if (data?.accepted && data?.jobId) navigate(`/fundi/job/${data.jobId}`);
    };
    realtimeService.on("fundi:response:ok", onOk);
    return () => realtimeService.off("fundi:response:ok", onOk);
  }, [navigate]);

  const stopLocationWatch = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const handleGoOnline = async () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported on this device"); return; }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const roundedAcc = typeof accuracy === "number" ? Math.round(accuracy) : null;
        if (roundedAcc != null && roundedAcc > maxAccuracyMeters) {
          toast.warning(`Low GPS accuracy (${roundedAcc}m). Try moving outdoors.`);
        }
        try {
          await apiClient.goOnline(latitude, longitude, roundedAcc ?? undefined);
          const token = localStorage.getItem("auth_token");
          if (token) realtimeService.connect(token);
          setCoords({ latitude, longitude, accuracy: roundedAcc ?? undefined });
          stopLocationWatch();
          watchIdRef.current = navigator.geolocation.watchPosition(
            (p) => {
              const now = Date.now();
              if (now - lastSentAtRef.current < 3000) return;
              lastSentAtRef.current = now;
              const a = typeof p.coords.accuracy === "number" ? Math.round(p.coords.accuracy) : undefined;
              setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: a });
              apiClient.updateLocation(p.coords.latitude, p.coords.longitude, a)
                .catch(() => realtimeService.updateLocation(p.coords.latitude, p.coords.longitude, a, true));
            },
            (e) => { toast.error(`Location tracking error: ${e.message}`); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
          setIsOnline(true);
          toast.success("You are now online — visible to customers!");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to go online");
        }
      },
      (error) => { toast.error(`Location access denied: ${error.message}`); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGoOffline = async () => {
    try {
      await apiClient.goOffline();
      stopLocationWatch();
      if (coords) realtimeService.updateLocation(coords.latitude, coords.longitude, coords.accuracy, false);
      realtimeService.disconnect();
      setIsOnline(false);
      toast.success("You are now offline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to go offline");
    }
  };

  const handleLogout = async () => {
    stopLocationWatch();
    await apiClient.logout().catch(console.error);
    realtimeService.disconnect();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-hero">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Failed to load dashboard.</p>
        <Button onClick={() => fetchDashboard()}>Retry</Button>
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    suspended: "bg-red-100 text-red-800",
  };
  const statColor = statusColorMap[dashboard.verificationStatus] || "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-gradient-hero">
      {isOnline && jobRequest && (
        <JobRequestModal
          request={jobRequest}
          remainingSec={remaining}
          onAccept={() => acceptJob(jobRequest.jobId as string)}
          onDecline={() => declineJob(jobRequest.jobId as string)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo size="xs" linkTo={false} />
            <span className="font-display font-bold">Fundi <span className="text-primary">Hub</span></span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => fetchDashboard(true)} disabled={refreshing} className="p-2 hover:bg-muted rounded-xl transition-colors">
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-muted rounded-xl transition-colors">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Status Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Verification</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statColor}`}>
                {dashboard.verificationStatus.charAt(0).toUpperCase() + dashboard.verificationStatus.slice(1)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Profile</p>
              <p className="font-bold text-primary text-xl">{dashboard.profileCompletion}%</p>
            </div>
          </div>

          <div className="flex gap-2">
            {!isOnline ? (
              <Button className="flex-1 bg-gradient-primary" onClick={handleGoOnline}>
                <Wifi className="w-4 h-4 mr-2" />Go Online
              </Button>
            ) : (
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleGoOffline}>
                <WifiOff className="w-4 h-4 mr-2" />Go Offline
              </Button>
            )}
          </div>

          {isOnline && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <MapPin className="w-3 h-3" />
              <span>Online — visible to nearby customers</span>
            </div>
          )}
        </motion.div>

        {/* Subscription warnings */}
        {subscriptionActive === false && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-800 text-sm">Subscription Inactive</p>
                <p className="text-xs text-yellow-700 mt-0.5 mb-3">Activate to accept jobs and receive payments.</p>
                <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={async () => {
                  try {
                    await apiClient.activateSubscription("monthly");
                    const st = await apiClient.getFundiStatus() as { status?: Record<string, unknown> };
                    if (st?.status) {
                      setSubscriptionActive(Boolean(st.status.subscriptionActive));
                      setSubscriptionDaysLeft(typeof st.status.daysLeft === "number" ? st.status.daysLeft : null);
                    }
                    toast.success("Subscription activated!");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to activate");
                  }
                }}>
                  Activate Subscription
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {subscriptionActive === true && subscriptionDaysLeft != null && subscriptionDaysLeft <= 7 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
            <p className="text-sm text-orange-700">Subscription expires in {subscriptionDaysLeft} day{subscriptionDaysLeft !== 1 ? 's' : ''}. Renew soon.</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: "Requests", value: dashboard.jobStats.newRequests, color: "text-blue-600 bg-blue-50" },
            { icon: BarChart3, label: "Active", value: dashboard.jobStats.activeJobs, color: "text-primary bg-primary/10" },
            { icon: Wallet, label: "Done", value: dashboard.jobStats.completedJobs, color: "text-green-600 bg-green-50" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-card rounded-2xl p-4 border border-border/50 text-center">
              <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center mb-2 mx-auto`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="font-bold text-xl leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Wallet & Rating */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate("/fundi/wallet")} className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-200 text-left hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-green-600" />
                <p className="text-xs text-green-700 font-medium">Wallet</p>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />
            </div>
            <p className="font-bold text-xl text-green-800">KES {Number(dashboard.walletBalance || 0).toFixed(0)}</p>
            <p className="text-xs text-green-600 mt-0.5">Available balance</p>
          </button>

          <div className="bg-card rounded-2xl p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
            <p className="font-bold text-xl">{Number(dashboard.ratings?.average || 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">{dashboard.ratings?.total || 0} reviews</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-2">
          {dashboard.jobStats.activeJobs > 0 && (
            <button onClick={() => navigate("/fundi/job/active")} className="w-full bg-card rounded-2xl p-4 border border-primary/30 flex items-center justify-between hover:bg-primary/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Active Job</p>
                  <p className="text-xs text-muted-foreground">Tap to view current job</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          )}

          {/* Wallet shortcut */}
          <button onClick={() => navigate("/fundi/wallet")} className="w-full bg-card rounded-2xl p-4 border border-border/50 flex items-center justify-between hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">My Wallet</p>
                <p className="text-xs text-muted-foreground">Earnings, withdrawals & history</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-green-700">KES {Number(dashboard.walletBalance || 0).toFixed(0)}</span>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>

          <button onClick={() => navigate("/fundi/disputes")} className="w-full bg-card rounded-2xl p-4 border border-border/50 flex items-center justify-between hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Scale className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Disputes</p>
                <p className="text-xs text-muted-foreground">Report or view disputes</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
