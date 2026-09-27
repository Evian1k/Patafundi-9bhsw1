/**
 * Report-a-problem form with a REAL job picker.
 *
 * User directive: nobody should have to find and type a Job ID. The form loads
 * the signed-in user's actual jobs (works for customers AND fundis - the
 * backend returns the right set per role) and lets them pick from a dropdown.
 * If the user opened the form from a specific job, that job is preselected.
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useModalA11y } from "@/lib/a11y";
import { X } from "lucide-react";

export const DISPUTE_REASONS = [
  "Work not completed as agreed",
  "Fundi did not show up",
  "Poor quality of work",
  "Overcharged / price mismatch",
  "Abusive or unsafe behaviour",
  "Property damage",
  "Off-platform payment pressure",
  "Other",
];

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  matching: "Matching",
  accepted: "Accepted",
  assigned: "Assigned",
  scheduled: "Scheduled",
  offered: "Offered",
  on_the_way: "On the Way",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export interface PickerJob {
  id: string;
  description?: string;
  service_category?: string;
  serviceCategory?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  price?: number;
  total_price?: number;
}

function jobLabel(job: PickerJob): string {
  const text = (job.description || job.serviceCategory || "Job").trim();
  return text.length > 64 ? `${text.slice(0, 64)}...` : text;
}

function jobMeta(job: PickerJob): string {
  const status = job.status ? (DISPUTE_STATUS_LABELS[job.status] || job.status) : "";
  const date = job.created_at || job.createdAt;
  const day = date
    ? new Date(date).toLocaleDateString("en-KE", { month: "short", day: "numeric" })
    : "";
  return [status, day].filter(Boolean).join(" - ");
}

// ── The form (inline-able; also used inside the modal) ──────────────────────

export function DisputeForm({
  fixedJobId,
  onSubmitted,
}: {
  fixedJobId?: string;
  onSubmitted?: () => void;
}) {
  const [jobs, setJobs] = useState<PickerJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobId, setJobId] = useState(fixedJobId || "");
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fixedJob = jobs.find((j) => j.id === fixedJobId);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const res = (await apiClient.getUserJobs()) as { jobs?: PickerJob[] };
      const list = res.jobs || [];
      setJobs(list);
    } catch {
      setJobsError("Could not load your jobs. Check your connection and try again.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // If a fixed job was requested but is not in the first page of results,
  // still show it as the chosen option.
  useEffect(() => {
    if (fixedJobId && !jobsLoading && jobs.length > 0) setJobId(fixedJobId);
  }, [fixedJobId, jobsLoading, jobs.length]);

  const submit = async () => {
    if (!jobId) {
      toast.error(jobsLoading ? "Still loading your jobs..." : "Please choose the job this is about");
      return;
    }
    if (!details.trim() || details.trim().length < 20) {
      toast.error("Please describe what went wrong (at least 20 characters)");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.openDispute(jobId, `${reason}: ${details.trim()}`);
      toast.success("Dispute submitted. Our team will review within 24 hours.");
      setDetails("");
      setReason(DISPUTE_REASONS[0]);
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit dispute");
    } finally {
      setSubmitting(false);
    }
  };

  if (jobsLoading && jobs.length === 0 && !fixedJobId) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Loading your jobs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selection */}
      {fixedJobId && fixedJob ? (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Reporting about</p>
            <p className="text-sm font-semibold truncate">{jobLabel(fixedJob)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{jobMeta(fixedJob)}</p>
          </div>
        </div>
      ) : fixedJobId && !fixedJob ? (
        <div className="p-3 bg-muted/50 rounded-xl text-xs text-muted-foreground">
          Reporting job {fixedJobId.substring(0, 8)}...
        </div>
      ) : jobsError ? (
        <div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-2">{jobsError}</div>
          <Button size="sm" variant="outline" onClick={loadJobs}>
            <Loader2 className={`w-3.5 h-3.5 mr-2 ${jobsLoading ? "animate-spin" : ""}`} />Reload jobs
          </Button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-4 bg-muted/50 rounded-xl text-center">
          <p className="text-sm font-semibold">No jobs to report yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Disputes are tied to a booking. Once you have a job, you can report a problem about it here.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="dispute-job" className="block text-sm font-medium mb-1.5">Which job is this about?</label>
          <select
            id="dispute-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full h-11 px-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
          >
            <option value="" disabled>Select your job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {jobLabel(j)} {jobMeta(j) ? `(${jobMeta(j)})` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Pick from your bookings - no need to find any ID.</p>
        </div>
      )}

      {/* Reason */}
      <div>
        <label htmlFor="dispute-reason" className="block text-sm font-medium mb-1.5">Reason</label>
        <select
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full h-11 px-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        >
          {DISPUTE_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Details */}
      <div>
        <label htmlFor="dispute-details" className="block text-sm font-medium mb-1.5">Details</label>
        <textarea
          id="dispute-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Describe the issue in detail. Include dates, amounts, and any relevant information..."
          rows={4}
          className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">{details.trim().length} / min 20 characters</p>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Important:</span> False disputes may affect your trust score.
          Provide honest and accurate information.
        </p>
      </div>

      <Button
        onClick={submit}
        disabled={submitting || (jobs.length === 0 && !fixedJobId)}
        className="w-full bg-gradient-primary"
      >
        {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit Dispute"}
      </Button>
    </div>
  );
}

// ── Modal wrapper (used from dashboards - user never leaves the page) ───────

export function ReportProblemModal({
  open,
  onClose,
  jobId,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  jobId?: string;
  onSubmitted?: () => void;
}) {
  const ref = useModalA11y(open, onClose);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) setSubmitted(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Report a problem">
      <div
        ref={ref}
        tabIndex={-1}
        className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border/50 shadow-xl max-h-[92vh] flex flex-col outline-none"
      >
        <div className="flex items-start gap-3 p-5 pb-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold leading-tight">Report a problem</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escrow stays protected while our team reviews. Typical response within 24 hours.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h4 className="font-semibold">Dispute submitted</h4>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Our team will review it and update you in your notifications. Escrow is frozen while the dispute is open.
              </p>
              <Button className="bg-gradient-primary" onClick={onClose}>Done</Button>
            </div>
          ) : (
            <DisputeForm
              fixedJobId={jobId}
              onSubmitted={() => {
                setSubmitted(true);
                onSubmitted?.();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Keep the old import surface alive for the header icon.
export { FileText as DisputeFormIcon };
