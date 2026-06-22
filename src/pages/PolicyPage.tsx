import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import Markdown from "@/components/content/Markdown";
import { apiClient } from "@/lib/api";

type Policy = {
  slug: string;
  title: string;
  body: string;
  version?: number;
  category?: string;
  updated_at?: string;
};

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
          <div className="text-center py-16">
            <p className="text-destructive mb-4">{error}</p>
            <Link to="/" className="text-primary hover:underline">← Back to home</Link>
          </div>
        ) : policy ? (
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">{policy.title}</h1>
            <p className="text-sm text-muted-foreground mb-8">
              {policy.version && <>Version {policy.version}</>}
              {policy.updated_at && <> · Last updated {new Date(policy.updated_at).toLocaleDateString()}</>}
            </p>
            <div className="prose prose-slate max-w-none">
              <Markdown content={policy.body} />
            </div>
            <div className="mt-12 pt-8 border-t border-border/30 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Questions about this policy?
              </p>
              <Link to="/contact-support" className="text-primary hover:underline">
                Contact Support →
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">Policy not found.</p>
            <Link to="/" className="text-primary hover:underline">← Back to home</Link>
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
