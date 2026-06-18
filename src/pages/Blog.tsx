import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import { apiClient } from "@/lib/api";

type BlogPost = { slug: string; title: string; excerpt?: string | null; cover_image_url?: string | null; published_at?: string | null };

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiClient.request("/blog", { includeAuth: false }) as { posts?: BlogPost[] };
        if (!cancelled) setPosts(data.posts || []);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load blog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-2">Blog</h1>
        <p className="text-muted-foreground mb-8">Product updates, trust & safety, and tips for customers and Fundis.</p>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-48 bg-muted rounded-2xl animate-shimmer" />)}
          </div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground">No posts yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {posts.map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`} className="bg-card rounded-2xl border border-border/50 overflow-hidden hover:shadow-md transition-all">
                {p.cover_image_url && <img src={p.cover_image_url} alt={p.title} className="w-full h-40 object-cover" />}
                <div className="p-5">
                  <h2 className="font-semibold text-lg mb-2 hover:text-primary transition-colors">{p.title}</h2>
                  {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>}
                  {p.published_at && <p className="text-xs text-muted-foreground mt-3">{new Date(p.published_at).toLocaleDateString()}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
