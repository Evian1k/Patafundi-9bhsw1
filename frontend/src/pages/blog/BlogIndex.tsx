import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import ServiceUnavailableState from "@/components/system/ServiceUnavailableState";
import { apiClient } from "@/lib/api";
import { CalendarDays, ArrowRight, Newspaper } from "lucide-react";
import BackBar from "@/components/layout/BackBar";

interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  published_at: string | null;
}

/**
 * Blog index (spec §47) — real posts from the database. When nothing has been
 * published yet the page says so honestly instead of filling with filler.
 */
export default function BlogIndex() {
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .listBlogPosts()
      .then((res: { posts?: BlogPostSummary[] }) => {
        if (alive) setPosts(res.posts || []);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : null;

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <BackBar to="/" fallback="/" label="Home" className="mb-4" />
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold mb-3">PataFundi Blog</h1>
          <p className="text-muted-foreground text-lg">
            Product updates, safety guidance, and stories from the PataFundi marketplace.
          </p>
        </div>

        {error ? (
          <ServiceUnavailableState
            title="Could not load articles"
            description="We could not reach the blog service. Check your connection and try again."
            onRetry={() => window.location.reload()}
          />
        ) : posts === null ? (
          <div className="space-y-4" aria-label="Loading articles">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-6 bg-card rounded-2xl border border-border/50 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-12 bg-card rounded-2xl border border-border/50 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Newspaper className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No articles yet</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              We publish product updates and safety guidance here as the platform grows. Check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="block p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{post.excerpt}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {post.published_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatDate(post.published_at)}
                    </span>
                  )}
                  {post.author && <span>{post.author}</span>}
                  <span className="inline-flex items-center gap-1 text-primary ml-auto">
                    Read article
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
