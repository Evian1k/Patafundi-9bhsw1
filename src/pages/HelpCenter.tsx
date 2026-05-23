import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import { apiClient } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Category = { id: string; slug: string; title: string; description?: string | null; category_order: number };
type Faq = { id: string; question: string; answer: string; faq_order: number; category_slug: string; category_title: string };

export default function HelpCenter() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const [categories, setCategories] = useState<Category[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (next: { q?: string; category?: string } = {}) => {
    const nextQ = typeof next.q === "string" ? next.q : q;
    const nextCat = typeof next.category === "string" ? next.category : category;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (nextQ) qs.set("q", nextQ);
      if (nextCat) qs.set("category", nextCat);
      const data = await apiClient.request(`/help?${qs.toString()}`, { includeAuth: false }) as { categories?: Category[]; faqs?: Faq[] };
      setCategories(data.categories || []);
      setFaqs(data.faqs || []);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to load Help Center");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [q, category]);

  const catTitle = useMemo(() => categories.find((c) => c.slug === category)?.title || "All Categories", [categories, category]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4">Help Center</h1>
        <p className="text-muted-foreground mb-6">Search FAQs or contact support if you can't find an answer.</p>
        <div className="flex gap-3 mb-6">
          <Input value={q} onChange={(e) => { const v = e.target.value; setParams((p) => { if (v) p.set("q", v); else p.delete("q"); return p; }); }} placeholder="Search help topics…" className="flex-1" />
          <Link to="/contact-support"><Button variant="outline">Contact Support</Button></Link>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant={!category ? "default" : "outline"} className="cursor-pointer" onClick={() => setParams((p) => { p.delete("category"); return p; })}>All</Badge>
          {categories.map((c) => (
            <Badge key={c.id} variant={category === c.slug ? "default" : "outline"} className="cursor-pointer" onClick={() => setParams((p) => { p.set("category", c.slug); return p; })}>{c.title}</Badge>
          ))}
        </div>
        <h2 className="font-semibold text-lg mb-4 flex gap-2">{catTitle} {q ? <span className="text-muted-foreground text-base font-normal">— "{q}"</span> : null}</h2>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-shimmer" />)}</div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : faqs.length === 0 ? (
          <p className="text-muted-foreground">No matching FAQs. <Link to="/contact-support" className="text-primary hover:underline">Contact Support</Link>.</p>
        ) : (
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.id} className="p-5 bg-card rounded-2xl border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">{f.category_title}</p>
                <h3 className="font-semibold text-sm mb-2">{f.question}</h3>
                <p className="text-sm text-muted-foreground">{f.answer}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 p-5 bg-muted rounded-2xl">
          <p className="font-semibold text-sm mb-1">Need urgent help?</p>
          <p className="text-sm text-muted-foreground">If you suspect fraud, abuse, or safety risk, use <Link to="/report-problem" className="text-primary hover:underline">Report a Problem</Link>.</p>
        </div>
      </div>
    </SiteLayout>
  );
}
