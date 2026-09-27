import { useEffect, useState } from "react";
import SiteLayout from "@/components/layout/SiteLayout";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Job = { slug: string; title: string; department?: string | null; location?: string | null; employment_type?: string | null; description: string; requirements?: string | null };

export default function Careers() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Job | null>(null);
  const [app, setApp] = useState({ fullName: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiClient.request("/careers/jobs", { includeAuth: false }) as { jobs?: Job[] };
        if (!cancelled) setJobs(data.jobs || []);
      } catch (e: unknown) {
        toast.error((e as Error)?.message || "Failed to load careers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!selected) return;
    if (!app.fullName.trim() || !app.email.trim()) { toast.error("Name and email are required"); return; }
    setSubmitting(true);
    try {
      await apiClient.request("/careers/apply", { method: "POST", includeAuth: false, body: { jobSlug: selected.slug, ...app } });
      toast.success("Application submitted");
      setApp({ fullName: "", email: "", phone: "", message: "" });
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-display font-bold mb-4">Careers</h1>
        <p className="text-muted-foreground mb-8">Build the future of trusted local services with PataFundi.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="font-semibold text-lg mb-4">Open roles</h2>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-shimmer" />)}</div>
            ) : jobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open roles right now.</p>
            ) : (
              <div className="space-y-3">
                {jobs.map((j) => (
                  <button key={j.slug} onClick={() => setSelected(j)} className={`w-full text-left rounded-2xl border p-4 bg-card hover:bg-accent/30 transition-colors ${selected?.slug === j.slug ? "ring-2 ring-primary/40" : ""}`}>
                    <p className="font-semibold text-sm">{j.title}</p>
                    <p className="text-xs text-muted-foreground">{[j.department, j.location, j.employment_type].filter(Boolean).join(" • ")}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            {!selected ? (
              <div className="p-6 bg-muted rounded-2xl text-center"><p className="text-muted-foreground text-sm">Select a role to view details and apply.</p></div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-xl">{selected.title}</h3>
                  <p className="text-sm text-muted-foreground">{[selected.department, selected.location, selected.employment_type].filter(Boolean).join(" • ")}</p>
                </div>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
                {selected.requirements && <p className="text-sm text-muted-foreground">{selected.requirements}</p>}
                <div className="space-y-3">
                  <Input value={app.fullName} onChange={(e) => setApp((s) => ({ ...s, fullName: e.target.value }))} placeholder="Full name" />
                  <Input value={app.email} onChange={(e) => setApp((s) => ({ ...s, email: e.target.value }))} placeholder="Email" type="email" />
                  <Input value={app.phone} onChange={(e) => setApp((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone (optional)" />
                  <Textarea value={app.message} onChange={(e) => setApp((s) => ({ ...s, message: e.target.value }))} placeholder="Tell us why you're a great fit (optional)" />
                  <Button className="w-full bg-gradient-primary" onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
