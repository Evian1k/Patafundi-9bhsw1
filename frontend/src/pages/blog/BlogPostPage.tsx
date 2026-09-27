import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BackBar from "@/components/layout/BackBar";
import SiteLayout from "@/components/layout/SiteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import ServiceUnavailableState from "@/components/system/ServiceUnavailableState";
import { apiClient } from "@/lib/api";
import { CalendarDays, ArrowLeft } from "lucide-react";

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  author: string | null;
  published_at: string | null;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "notfound" }
  | { phase: "ready"; post: BlogPost };

/** Minimal, safe rendering for the plain-text / light-markdown post bodies. */
function PostBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="text-lg font-semibold mt-6">{trimmed.slice(4)}</h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={idx} className="text-xl font-semibold mt-8">{trimmed.slice(3)}</h2>
          );
        }
        if (trimmed.split("\n").every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={idx} className="list-disc pl-6 space-y-1.5 text-muted-foreground">
              {trimmed.split("\n").map((line, li) => (
                <li key={li}>{line.trim().slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-muted-foreground leading-relaxed">{trimmed}</p>
        );
      })}
    </div>
  );
}

/**
 * Blog article (spec §47) — rendered from the database record. A missing post
 * shows an honest "not published" state, never filler content.
 */
export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ phase: "loading" });
    if (!slug) {
      setState({ phase: "notfound" });
      return;
    }
    apiClient
      .getBlogPost(slug)
      .then((res: { post?: BlogPost | null }) => {
        if (!alive) return;
        setState(res.post ? { phase: "ready", post: res.post } : { phase: "notfound" });
      })
      .catch(() => {
        if (alive) setState({ phase: "error" });
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : null;

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
          <BackBar to="/blog" fallback="/blog" label="Blog" className="mb-4" />
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          All articles
        </Link>

        {state.phase === "error" ? (
          <ServiceUnavailableState
            title="Could not load this article"
            description="We could not reach the blog service. Check your connection and try again."
            onRetry={() => window.location.reload()}
          />
        ) : state.phase === "loading" ? (
          <div className="space-y-4" aria-label="Loading article">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : state.phase === "notfound" ? (
          <div className="p-12 bg-card rounded-2xl border border-border/50 text-center">
            <h1 className="text-xl font-semibold mb-2">Article not available</h1>
            <p className="text-muted-foreground text-sm">
              This article does not exist or has not been published yet.
            </p>
          </div>
        ) : (
          <article>
            <h1 className="text-4xl font-display font-bold mb-4">{state.post.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
              {state.post.published_at && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  {formatDate(state.post.published_at)}
                </span>
              )}
              {state.post.author && <span>{state.post.author}</span>}
            </div>
            <PostBody body={state.post.body} />
          </article>
        )}
      </div>
    </SiteLayout>
  );
}
