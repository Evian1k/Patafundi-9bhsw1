import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus, Clock, CheckCircle, MapPin, LogOut, Settings,
  Wrench, ChevronRight, AlertCircle, Trash2, RefreshCw,
  Wallet, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { DEMO_MODE, demoJobs, demoUser } from "@/lib/demo";
import ServiceUnavailableState from "@/components/system/ServiceUnavailableState";

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

const ACTIVE_STATUSES = ['pending', 'matching', 'accepted', 'on_the_way', 'arrived', 'in_progress'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id?: string; email?: string; fullName?: string | null } | null>(
    DEMO_MODE ? demoUser : null
  );
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [activeJobs, setActiveJobs] = useState<JobData[]>(
    DEMO_MODE ? demoJobs.filter((j) => ACTIVE_STATUSES.includes(j.status)) : []
  );
  const [recentJobs, setRecentJobs] = useState<JobData[]>(
    DEMO_MODE ? demoJobs.filter((j) => j.status === 'completed') : []
  );
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const fetchUserJobs = useCallback(async () => {
    if (DEMO_MODE) return;
    setJobsLoading(true);
    setJobsError(null);
    try {
      const response = await apiClient.getUserJobs() as { success?: boolean; jobs?: JobData[] };
      const jobs = response.jobs || [];
      setActiveJobs(jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)));
      setRecentJobs(jobs.filter((j) => j.status === 'completed').slice(0, 10));
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setJobsError("Unable to load your jobs. Please try again.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    if (DEMO_MODE) { setLoading(false); return; }
    try {
      const userData = await apiClient.getCurrentUser();
      setUser(userData.user);
      const role = String(userData?.user?.role || "").toLowerCase();
      if (role === "admin") { navigate("/admin/dashboard"); return; }
      if (role === "fundi") { navigate("/fundi"); return; }
      if (role === "fundi_pending") { navigate("/fundi/pending"); return; }
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
    if (!DEMO_MODE) {
      const token = localStorage.getItem("auth_token");
      if (!token) { navigate("/auth"); return; }
    }
    loadUserData();
  }, [navigate, loadUserData]);

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
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="text-white font-bold text-xs">P</span>
            </div>
            <span className="font-display font-bold">Pata<span className="text-primary">Fundi</span></span>
            {DEMO_MODE && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Demo</span>}
          </div>
          <div className="flex items-center gap-1">
            {!DEMO_MODE && (
              <button onClick={() => fetchUserJobs()} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Refresh">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button onClick={() => navigate("/settings")} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Settings">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={handleSignOut} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Sign out">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-display font-bold">
            Hello, {String(user?.fullName ?? '').split(" ")[0] || "there"}!
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">What needs fixing today?</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/create-job")}
            className="flex flex-col items-start gap-2 p-4 bg-gradient-primary rounded-2xl text-white shadow-glow"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">New Job</p>
              <p className="text-white/70 text-xs">Get matched fast</p>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/disputes")}
            className="flex flex-col items-start gap-2 p-4 bg-card rounded-2xl border border-border/50"
          >
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <Scale className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm">Disputes</p>
              <p className="text-muted-foreground text-xs">Report issues</p>
            </div>
          </motion.button>
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
                  onClick={() => navigate(`/job/${job.id}/tracking`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/job/${job.id}/tracking`); }}
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
                    <span className="truncate">{job.location}</span>
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
                  <span className="text-xs text-muted-foreground shrink-0">
                    {job.service_categories?.name || job.urgency || job.category}
                  </span>
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
      </div>
    </div>
  );
}
