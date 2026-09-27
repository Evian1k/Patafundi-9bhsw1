import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus, Clock, CheckCircle, MapPin, LogOut, Settings,
  Wrench, ChevronRight, AlertCircle, Trash2, RefreshCw,
  Wallet, Scale, CalendarDays, Heart, LifeBuoy, Search, FileText,
  MessageSquareText, Flag, TrendingUp,
} from "lucide-react";
import { ReportProblemModal } from "@/components/support/ReportProblemModal";
import { HelpLinksInline } from "@/components/support/HelpKit";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { realtimeService } from "@/services/realtime";
import { bootstrapAuthSessionFromUser, resolveAuthRole } from "@/lib/authSession";
import { toast } from "sonner";
import { sanitizeLocationText, LOCATION_FALLBACK } from "@/lib/maps/geocoding";
import ServiceUnavailableState from "@/components/system/ServiceUnavailableState";
import NotificationBell from "@/components/system/NotificationBell";
import { BrandLogo } from "@/assets/logo";
import { SERVICE_CATALOG, CORE_SERVICE_IDS, findService, bookingPathForService } from "@/config/services";

const LOCATION_ONBOARDING_KEY = "pf_location_onboarding";

/** Branded location-permission explainer (spec §8): context FIRST, then the
 * browser prompt. Denial never blocks the app — manual location stays
 * available in Settings. */
function LocationOnboarding() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"idle" | "asking" | "denied" | "granted">("idle");

  useEffect(() => {
    setVisible(!localStorage.getItem(LOCATION_ONBOARDING_KEY));
  }, []);

  const dismiss = (value: string) => {
    localStorage.setItem(LOCATION_ONBOARDING_KEY, value);
    setVisible(false);
  };

  const allowLocation = () => {
    setState("asking");
    if (!navigator.geolocation) {
      setState("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem("pf_location_label", "Current location");
        setState("granted");
        setTimeout(() => dismiss("granted"), 900);
      },
      () => setState("denied"),
      { timeout: 10000 },
    );
  };

  if (!visible) return null;

  return (
    <div className="bg-card rounded-3xl border border-border/50 p-5 relative overflow-hidden">
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-start gap-4 relative">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <MapPin className="w-6 h-6 text-primary animate-bounce" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold">Find help near you</h3>
          <p className="text-sm text-muted-foreground mt-1">
            We use your location to show nearby professionals and calculate accurate arrival times.
          </p>
          {state === "denied" && (
            <p className="text-xs text-amber-600 mt-2">
              No problem - you can set your location manually in Settings at any time.
            </p>
          )}
          {state === "granted" ? (
            <p className="text-xs text-green-600 mt-2 font-medium">Location saved ✓</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" className="bg-gradient-primary" onClick={allowLocation} disabled={state === "asking"}>
                {state === "asking" ? "Checking..." : "Allow Location"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { dismiss("manual"); navigate("/settings"); }}>
                Choose Location Manually
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => dismiss("skipped")}>
                Not now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface JobData {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  updated_at?: string;
  urgency?: string;
  job_photos?: { url: string }[];
  service_categories?: { name: string };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  matching: "Finding Fundis",
  accepted: "Accepted",
  on_the_way: "On the Way",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  matching: "bg-blue-500/10 text-blue-600 border-blue-200",
  accepted: "bg-purple-500/10 text-purple-600 border-purple-200",
  on_the_way: "bg-purple-500/10 text-purple-600 border-purple-200",
  arrived: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  in_progress: "bg-primary/10 text-primary border-primary/20",
};

import { CUSTOMER_ACTIVE_STATUSES } from '@/lib/bookingStatus';

function openJobTracking(navigate: ReturnType<typeof useNavigate>, jobId: string) {
  navigate(`/job/${jobId}/tracking`);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id?: string; email?: string; fullName?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<JobData[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobData[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  // Counts come from the database (spec section 7) - never from UI state.
  const [dbStats, setDbStats] = useState<{ activeJobs?: number; completedJobs?: number; pendingQuotes?: number; totalBookings?: number } | null>(null);
  // Report-a-problem opens INLINE on this dashboard - the user never leaves.
  const [reportJob, setReportJob] = useState<JobData | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const openReport = (job: JobData) => {
    setReportJob(job);
    setReportOpen(true);
  };

  const fetchUserJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const response = await apiClient.getUserJobs() as { success?: boolean; jobs?: JobData[] };
      const jobs = response.jobs || [];
      // Classification uses the shared taxonomy: a quoted booking is active,
      // never silently completed.
      setActiveJobs(jobs.filter((j) => CUSTOMER_ACTIVE_STATUSES.includes(j.status)));
      setRecentJobs(jobs.filter((j) => ['payment_confirmed', 'completed', 'closed'].includes(j.status)).slice(0, 10));
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setJobsError("Unable to load your jobs. Please try again.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    try {
      const userData = await apiClient.getCurrentUser();
      bootstrapAuthSessionFromUser(userData.user);
      setUser(userData.user);
      const role = resolveAuthRole(userData.user);
      if (role === "admin") { navigate("/admin/dashboard"); return; }
      if (role === "fundi") { navigate("/fundi"); return; }
      if (role === "fundi_pending") { navigate("/fundi/pending"); return; }
      // Company admins landing here (stale session / manual URL) belong in
      // the company portal — same routing as the login page.
      if (String(userData.user?.role || "").toLowerCase() === "company_admin") {
        navigate("/company");
        return;
      }
      await fetchUserJobs();
    } catch (error) {
      console.error("Failed to load user data:", error);
      localStorage.removeItem("auth_token");
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  }, [navigate, fetchUserJobs]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { navigate("/auth"); return; }
    loadUserData();
  }, [navigate, loadUserData]);

  // Booking stats are fetched from the DB (spec section 7).
  useEffect(() => {
    apiClient.request('/jobs/stats')
      .then((res) => setDbStats((res as { stats?: Record<string, number> })?.stats || null))
      .catch(() => setDbStats(null));
  }, []);

  const cancelJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to cancel this job?")) return;
    try {
      await apiClient.cancelJob(jobId, "Customer cancelled from dashboard");
      setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success("Job cancelled successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel job");
    }
  };

  const handleSignOut = async () => {
    // Close the realtime socket BEFORE clearing the token (spec §57): the
    // singleton must not survive logout trying to reconnect with a dead JWT.
    realtimeService.disconnect();
    await apiClient.logout().catch(console.error);
    toast.success("Signed out");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo size="xs" iconOnly linkTo={false} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => fetchUserJobs()} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Refresh">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
            <NotificationBell />
            <button onClick={() => navigate("/settings")} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Settings">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={handleSignOut} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Sign out">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-10 space-y-5">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl md:text-4xl font-display font-bold">
            Hello, {String(user?.fullName ?? '').split(" ")[0] || "there"}!
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {localStorage.getItem("pf_location_label") || "Set your location for nearby results"}
          </p>
        </div>

        {/* Branded location onboarding (spec §8) */}
        <LocationOnboarding />

        {/* ClickUp-style stat strip - counts come from the DATABASE via
            /jobs/stats (spec section 7). UI state never invents numbers. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-xl leading-none">{dbStats?.activeJobs ?? activeJobs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Active jobs</p>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-xl leading-none">{dbStats?.completedJobs ?? recentJobs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Completed</p>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-xl leading-none">{dbStats?.pendingQuotes ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Quotes to review</p>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-xl leading-none">{dbStats?.totalBookings ?? '-'}</p>
              <p className="text-xs text-muted-foreground mt-1">Total bookings</p>
            </div>
          </div>
        </div>

        {/* What do you need help with? (spec §11 hero card) */}
        <div className="bg-gradient-primary rounded-3xl p-6 text-white shadow-glow relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <h2 className="font-display font-bold text-xl md:text-2xl mb-1">What do you need help with?</h2>
          <p className="text-white/80 text-sm mb-4">Describe a problem and get matched with a verified professional.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => navigate("/create-job")}
              className="bg-white text-primary hover:bg-white/90 font-semibold"
            >
              <MessageSquareText className="w-4 h-4 mr-2" />
              Describe a problem
            </Button>
            <Button
              variant="outline"
              className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold"
              onClick={() => document.getElementById("home-categories")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Search className="w-4 h-4 mr-2" />
              Search services
            </Button>
          </div>
        </div>

        {/* Service categories (spec §11 grid, §22/§28 catalog): every click
            goes DIRECTLY into the booking flow - no informational page. */}
        <div id="home-categories">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Services</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && serviceQuery.trim()) {
                  navigate(`/create-job?service=${encodeURIComponent(serviceQuery.trim())}`);
                }
              }}
              placeholder="Search for a service, e.g. water heater repair"
              aria-label="Search for a service"
              className="w-full h-11 pl-10 pr-4 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(showAllServices
              ? SERVICE_CATALOG
              : SERVICE_CATALOG.filter((s) => (CORE_SERVICE_IDS as readonly string[]).includes(s.id))
            )
              .filter((s) => !serviceQuery.trim() || s.name.toLowerCase().includes(serviceQuery.trim().toLowerCase()))
              .map((s) => (
              <Link
                key={s.id}
                to={bookingPathForService(s.name)}
                className="bg-card rounded-2xl border border-border/50 p-4 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-2`}>
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-semibold leading-tight">{s.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Book now</p>
              </Link>
            ))}
            {serviceQuery.trim() &&
              SERVICE_CATALOG.filter((s) => s.name.toLowerCase().includes(serviceQuery.trim().toLowerCase())).length === 0 && (
              <Link
                to={`/create-job?service=${encodeURIComponent(serviceQuery.trim())}`}
                className="md:col-span-3 col-span-1 bg-card rounded-2xl border border-dashed border-primary/40 p-4 flex items-center gap-3 hover:bg-primary/5 transition-colors"
              >
                <Plus className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Can't find “{serviceQuery.trim()}”?</p>
                  <p className="text-[11px] text-muted-foreground">Describe what you need and we'll match you with the right professional.</p>
                </div>
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAllServices((v) => !v)}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            {showAllServices ? "Show fewer services" : `View all services (${SERVICE_CATALOG.length})`}
          </button>
        </div>

        {/* Quick links (spec §20 customer IA) */}
        <div className="grid grid-cols-3 gap-3">
          <Link to="/bookings" className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-start gap-2 hover:border-primary/40 transition-all">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">Bookings</p>
              <p className="text-muted-foreground text-xs">All your jobs</p>
            </div>
          </Link>
          <Link to="/favorites" className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-start gap-2 hover:border-primary/40 transition-all">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <Heart className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">Saved</p>
              <p className="text-muted-foreground text-xs">Favorite providers</p>
            </div>
          </Link>
          <Link to="/disputes" className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-start gap-2 hover:border-primary/40 transition-all">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <LifeBuoy className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">Support</p>
              <p className="text-muted-foreground text-xs">Disputes & help</p>
            </div>
          </Link>
        </div>

        {/* Active Jobs */}
        {jobsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="h-24 bg-muted/50 rounded-2xl animate-shimmer" />
            ))}
          </div>
        ) : jobsError ? (
          <ServiceUnavailableState
            title="Jobs Unavailable"
            description={jobsError}
            onRetry={() => fetchUserJobs()}
            compact
          />
        ) : activeJobs.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Jobs</h2>
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl p-4 border border-border/50 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openJobTracking(navigate, job.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openJobTracking(navigate, job.id); }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {STATUS_LABELS[job.status] || job.status}
                        </span>
                      </div>
                      <p className="font-semibold text-sm truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{job.description}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openReport(job); }}
                        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"
                        title="Report a problem with this job"
                        aria-label="Report a problem with this job"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                        title="Cancel job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{sanitizeLocationText(job.location, LOCATION_FALLBACK)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Recent / Completed Jobs */}
        {recentJobs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Completed Jobs</h2>
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div key={job.id} className="bg-card rounded-2xl p-4 border border-border/50 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Completed {new Date(job.updated_at || job.updatedAt || '').toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {job.service_categories?.name || job.urgency || job.category}
                    </span>
                    <button
                      onClick={() => openReport(job)}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Get help
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!jobsLoading && !jobsError && activeJobs.length === 0 && recentJobs.length === 0 && (
          <div className="text-center py-12 bg-card rounded-3xl border border-border/50">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold mb-2">No Jobs Yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
              Create your first job request to get matched with a verified fundi near you.
            </p>
            <Button
              onClick={() => navigate("/create-job")}
              className="bg-gradient-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Job Request
            </Button>
          </div>
        )}

        {/* Help - opens right here, never redirects */}
        <HelpLinksInline title="Need help with anything?" />
      </div>

      {/* Report-a-problem modal (inline; job preselected when opened from a card) */}
      <ReportProblemModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        jobId={reportJob?.id}
        onSubmitted={fetchUserJobs}
      />
    </div>
  );
}
