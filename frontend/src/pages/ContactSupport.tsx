import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import BackBar from "@/components/layout/BackBar";

export default function ContactSupport() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.message.trim()) { toast.error("Message is required"); return; }
    setSubmitting(true);
    try {
      await apiClient.request("/support/ticket", {
        method: "POST",
        includeAuth: true,
        body: { ...form, category: "support", priority: "normal" },
      });
      toast.success("Support ticket created");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <BackBar to="/" fallback="/" label="Home" className="mb-4" />
        <h1 className="text-4xl font-display font-bold mb-4">Support Center</h1>
        <p className="text-muted-foreground mb-6">
          Real people, real answers. PataFundi support can help with booking problems, payment problems,
          fundi or company issues, quote issues, cancellations, refunds, disputes, account problems and safety concerns.
        </p>

        {/* What support can help with (spec section 13) */}
        <div className="mb-8 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">What we can help with</h2>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
            {[
              "Booking problems",
              "Payment problems",
              "Fundi or company issues",
              "Quote issues",
              "Cancellations",
              "Refunds",
              "Disputes",
              "Account problems",
              "Safety concerns",
            ].map((topic) => (
              <p key={topic} className="flex gap-2"><span className="text-primary">•</span>{topic}</p>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <button
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2 font-medium"
              onClick={() => document.getElementById("support-form")?.scrollIntoView({ behavior: "smooth" })}
            >
              Start Support Request
            </button>
            <Link to="/disputes" className="rounded-xl border px-4 py-2 hover:bg-muted">View My Tickets / Disputes</Link>
            <Link to="/report-problem" className="rounded-xl border px-4 py-2 hover:bg-muted">Report a Problem</Link>
          </div>
        </div>

        <h2 className="text-2xl font-display font-bold mb-3">Send us a message</h2>
        <div id="support-form" className="space-y-4">
          <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Name (optional)" />
          <Input value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} placeholder="Email (optional)" type="email" />
          <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject (optional)" />
          <Textarea value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} placeholder="How can we help?" className="min-h-[140px]" />
          <Button className="w-full bg-gradient-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
