import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import Markdown from "@/components/content/Markdown";
import { apiClient } from "@/lib/api";

type Post = { slug: string; title: string; excerpt?: string | null; content: string; cover_image_url?: string | null; published_at?: string | null };

export default function BlogPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiClient.request(`/blog/${slug}`, { includeAuth: false }) as { post?: Post };
        if (!cancelled) setPost(data.post || null);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load post");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Link to="/blog" className="text-sm text-primary hover:underline mb-6 inline-block">← Back to Blog</Link>
        {loading ? (
          <div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-6 bg-muted rounded animate-shimmer" />)}</div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : post ? (
          <div>
            <h1 className="text-4xl font-display font-bold mb-3">{post.title}</h1>
            {post.excerpt && <p className="text-lg text-muted-foreground mb-4">{post.excerpt}</p>}
            {post.published_at && <p className="text-xs text-muted-foreground mb-6">{new Date(post.published_at).toLocaleDateString()}</p>}
            {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} className="w-full rounded-2xl mb-8 object-cover max-h-80" />}
            <Markdown content={post.content} />
          </div>
        ) : null}
      </div>
    </SiteLayout>
  );
}
