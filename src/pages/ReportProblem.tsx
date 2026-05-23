import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { useState } from "react";
import { toast } from "sonner";

const categories = [
  { value: "fraud", label: "Fraud / Scam" },
  { value: "abuse", label: "Abuse / Harassment" },
  { value: "payment", label: "Payment Issue" },
  { value: "fake-fundi", label: "Fake Fundi / Impersonation" },
  { value: "safety", label: "Safety Concern" },
  { value: "other", label: "Other" },
];

export default function ReportProblem() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", category: "fraud" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.message.trim()) { toast.error("Message is required"); return; }
    setSubmitting(true);
    try {
      await apiClient.request("/support/ticket", {
        method: "POST",
        includeAuth: true,
        body: { ...form, category: form.category, priority: "high" },
      });
      toast.success("Report submitted as high priority");
      setForm({ name: "", email: "", subject: "", message: "", category: "fraud" });
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <h1 className="text-4xl font-display font-bold mb-4">Report a Problem</h1>
        <p className="text-muted-foreground mb-8">Use this form for fraud, abuse, safety, or serious platform issues. Reports are treated as high priority.</p>
        <div className="space-y-4">
          <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Name (optional)" />
          <Input value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} placeholder="Email (optional)" type="email" />
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject (optional)" />
          <Textarea value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="Describe the problem. Include job ID, usernames, and any evidence you have." className="min-h-[160px]" />
          <Button className="w-full bg-gradient-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Report"}
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
