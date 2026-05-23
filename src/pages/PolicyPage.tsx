import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import Markdown from "@/components/content/Markdown";
import { apiClient } from "@/lib/api";

type PolicySection = { id: string; title: string; content: string; order: number };
type Policy = { slug: string; title: string; version: string; updated_at?: string; sections: PolicySection[] };

export default function PolicyPage({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp || params.slug || "";
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiClient.request(`/policies/${slug}`, { includeAuth: false }) as { policy?: Policy };
        if (!cancelled) setPolicy(data.policy || null);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load policy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded animate-shimmer" />)}
          </div>
        ) : error ? (
          <div className="text-center py-16"><p className="text-destructive">{error}</p></div>
        ) : policy ? (
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">{policy.title}</h1>
            <p className="text-sm text-muted-foreground mb-8">Version {policy.version}</p>
            <div className="space-y-8">
              {policy.sections?.map((s) => (
                <div key={s.id} className="p-6 bg-card rounded-2xl border border-border/50">
                  <h2 className="text-xl font-semibold mb-4">{s.title}</h2>
                  <Markdown content={s.content} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </SiteLayout>
  );
}
