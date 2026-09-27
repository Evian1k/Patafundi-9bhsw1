/**
 * Inline help kit - support that comes to the user, never sends them away.
 *
 * The product rule (user directive): fundis and customers must be able to get
 * help, read safety guidelines and read platform rules WHERE THEY ARE. Every
 * entry point here opens an in-place modal - zero route navigation.
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Loader2, MessageSquare, ShieldCheck, ScrollText, X, RefreshCw, LifeBuoy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useModalA11y } from "@/lib/a11y";

// ── Modal shell (shared) ────────────────────────────────────────────────────

function InlineModal({
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const ref = useModalA11y(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        ref={ref}
        tabIndex={-1}
        className={`bg-card w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl border border-border/50 shadow-xl max-h-[92vh] flex flex-col outline-none`}
      >
        <div className="flex items-start gap-3 p-5 pb-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Policy content (fetched, cached per session) ────────────────────────────

interface PolicySection {
  heading: string;
  body: string;
}

const policyCache = new Map<string, { title: string; sections: PolicySection[] }>();

function usePolicySections(slug: string, open: boolean) {
  const [state, setState] = useState<{ loading: boolean; title: string; sections: PolicySection[]; error: string | null }>({
    loading: false,
    title: "",
    sections: [],
    error: null,
  });

  const load = useCallback(async () => {
    const cached = policyCache.get(slug);
    if (cached) {
      setState({ loading: false, title: cached.title, sections: cached.sections, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = (await apiClient.request(`/policies/${slug}`, { method: "GET" })) as {
        policy?: { title?: string; sections?: PolicySection[] };
      };
      const title = res.policy?.title || "";
      const sections = res.policy?.sections || [];
      policyCache.set(slug, { title, sections });
      setState({ loading: false, title, sections, error: null });
    } catch {
      setState({ loading: false, title: "", sections: [], error: "Could not load this content right now." });
    }
  }, [slug]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return { ...state, reload: load };
}

export function PolicyModal({ slug, open, onClose, icon, subtitle }: { slug: string; open: boolean; onClose: () => void; icon?: ReactNode; subtitle?: string }) {
  const { loading, title, sections, error, reload } = usePolicySections(slug, open);
  return (
    <InlineModal open={open} onClose={onClose} icon={icon ?? <ScrollText className="w-5 h-5 text-primary" />} title={title || (slug === "safety" ? "Safety Guidelines" : "Platform Rules")} subtitle={subtitle}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button size="sm" variant="outline" onClick={reload}>
            <RefreshCw className="w-3.5 h-3.5 mr-2" />Retry
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nothing published here yet.</p>
      ) : (
        <div className="space-y-5">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && <h4 className="font-semibold text-sm mb-1.5">{s.heading}</h4>}
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      )}
    </InlineModal>
  );
}

// ── Contact support (creates a real ticket via /support/ticket) ─────────────

export function ContactSupportModal({ open, onClose, defaultSubject }: { open: boolean; onClose: () => void; defaultSubject?: string }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setSent(false);
      setSubject(defaultSubject || "");
      setMessage("");
    }
  }, [open, defaultSubject]);

  const submit = async () => {
    if (!message.trim() || message.trim().length < 10) {
      toast.error("Please describe the issue (at least 10 characters)");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.request("/support/ticket", {
        method: "POST",
        includeAuth: true,
        body: { subject: subject.trim() || "Support request", message: message.trim(), category: "support", priority: "normal" },
      });
      setSent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <InlineModal open={open} onClose={onClose} icon={<MessageSquare className="w-5 h-5 text-primary" />} title="Contact Support" subtitle="Our team replies as soon as possible - replies arrive in your notifications.">
      {sent ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h4 className="font-semibold">Message sent</h4>
          <p className="text-sm text-muted-foreground mt-1 mb-5">We have your request. You will hear back from us in your notifications.</p>
          <Button className="bg-gradient-primary" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="support-subject" className="block text-sm font-medium mb-1.5">Subject</label>
            <input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Payment did not reflect"
              className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            />
          </div>
          <div>
            <label htmlFor="support-message" className="block text-sm font-medium mb-1.5">Message</label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Tell us what happened. Include dates, amounts and anything that helps us help you faster..."
              className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
            />
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full bg-gradient-primary">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send message"}
          </Button>
        </div>
      )}
    </InlineModal>
  );
}

// ── Inline help row (drop-in replacement for redirect links) ────────────────

export function HelpLinksInline({ title = "Need more help?" }: { title?: string }) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const items = [
    { label: "Contact Support", desc: "Message our team", icon: <MessageSquare className="w-4 h-4 text-primary" />, action: () => setSupportOpen(true) },
    { label: "Safety Guidelines", desc: "Stay safe on every job", icon: <ShieldCheck className="w-4 h-4 text-primary" />, action: () => setSafetyOpen(true) },
    { label: "Platform Rules", desc: "What is allowed here", icon: <ScrollText className="w-4 h-4 text-primary" />, action: () => setRulesOpen(true) },
  ];

  return (
    <>
      <div className="bg-muted/50 rounded-2xl p-4">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-primary" />
          {title}
        </h4>
        <div className="grid sm:grid-cols-3 gap-2">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={it.action}
              className="flex items-center gap-3 p-3 bg-card border border-border/50 rounded-xl text-left hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{it.icon}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{it.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{it.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      <ContactSupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <PolicyModal slug="safety" open={safetyOpen} onClose={() => setSafetyOpen(false)} icon={<ShieldCheck className="w-5 h-5 text-primary" />} />
      <PolicyModal slug="platform-rules" open={rulesOpen} onClose={() => setRulesOpen(false)} icon={<ScrollText className="w-5 h-5 text-primary" />} />
    </>
  );
}
