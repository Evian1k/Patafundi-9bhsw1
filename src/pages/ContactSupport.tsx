import SiteLayout from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { useState } from "react";
import { toast } from "sonner";

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
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <h1 className="text-4xl font-display font-bold mb-4">Contact Support</h1>
        <p className="text-muted-foreground mb-8">Send us a message and our team will respond as soon as possible.</p>
        <div className="space-y-4">
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
