import { useEffect, useState } from "react";
import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ServiceUnavailableState from "@/components/system/ServiceUnavailableState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { MapPin, Briefcase, BriefcaseBusiness, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface CareerJob {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  type: string | null;
  status: string;
}

/**
 * Careers (spec §46) — open roles come from the database. When there are no
 * openings the page says so honestly: "Open positions will appear here when
 * available." Applications are real rows in career_applications reviewed by
 * the team.
 */
export default function Careers() {
  const [jobs, setJobs] = useState<CareerJob[] | null>(null);
  const [error, setError] = useState(false);
  const [applying, setApplying] = useState<CareerJob | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", coverLetter: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = () => {
    setError(false);
    setJobs(null);
    apiClient
      .listCareersJobs()
      .then((res: { jobs?: CareerJob[] }) => setJobs(res.jobs || []))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
  }, []);

  const openApply = (job: CareerJob) => {
    setForm({ fullName: "", email: "", phone: "", coverLetter: "" });
    setSubmitted(false);
    setApplying(job);
  };

  const submitApplication = async () => {
    if (!applying) return;
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error("Full name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.applyToCareerJob({
        jobId: applying.id,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        coverLetter: form.coverLetter.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your application. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold mb-3">Careers at PataFundi</h1>
          <p className="text-muted-foreground text-lg">
            Help us build the operating system for local services across Africa and beyond.
          </p>
        </div>

        {error ? (
          <ServiceUnavailableState
            title="Could not load open positions"
            description="We could not reach the careers service. Check your connection and try again."
            onRetry={load}
          />
        ) : jobs === null ? (
          <div className="space-y-4" aria-label="Loading positions">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-6 bg-card rounded-2xl border border-border/50 space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 bg-card rounded-2xl border border-border/50 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <BriefcaseBusiness className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No open positions right now</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Open positions will appear here when available. We are a small, focused team and hire
              deliberately - check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">{job.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1.5">
                    {job.department && <span>{job.department}</span>}
                    {job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {job.location}
                      </span>
                    )}
                    {job.type && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        {job.type}
                      </span>
                    )}
                  </div>
                </div>
                <Button onClick={() => openApply(job)}>Apply</Button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={Boolean(applying)} onOpenChange={(open) => !open && setApplying(null)}>
          <DialogContent className="sm:max-w-lg">
            {submitted ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <DialogHeader>
                  <DialogTitle className="text-xl">Application received</DialogTitle>
                  <DialogDescription className="mx-auto max-w-sm">
                    Thank you for applying to the {applying?.title} role. Our team reviews every
                    application and will contact you if there is a match.
                  </DialogDescription>
                </DialogHeader>
                <Button className="mt-4" onClick={() => setApplying(null)}>Done</Button>
              </div>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Apply - {applying?.title}</DialogTitle>
                  <DialogDescription>
                    Tell us who you are and why you are a good fit. Every field marked required must
                    be filled in.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="careers-name">Full name *</Label>
                    <Input
                      id="careers-name"
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      placeholder="Jane Wanjiku"
                      maxLength={120}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="careers-email">Email *</Label>
                      <Input
                        id="careers-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="you@example.com"
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="careers-phone">Phone</Label>
                      <Input
                        id="careers-phone"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="+254 7XX XXX XXX"
                        maxLength={24}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="careers-cover">Cover note</Label>
                    <Textarea
                      id="careers-cover"
                      value={form.coverLetter}
                      onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
                      placeholder="A short note about your experience and what you would bring to PataFundi."
                      rows={4}
                      maxLength={3000}
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setApplying(null)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button onClick={submitApplication} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit application"
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <div className="flex gap-3 mt-10">
          <Button variant="outline" onClick={() => window.history.length > 1 && window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
