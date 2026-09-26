/** Quality (spec §8 QUALITY) — company ratings, reviews and guarantees. */
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Review { id: string; rating: number; comment?: string; created_at: string; job_id: string; service_category: string; customer_name?: string }
interface Stats { averageRating: number; total: number; positive: number }

export default function PortalQuality() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/reviews") as { reviews?: Review[]; stats?: Stats };
        setReviews(res.reviews || []);
        setStats(res.stats || null);
      } catch {
        setError("Unable to load reviews.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="max-w-4xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Quality</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Ratings and reviews from your customers.</p>

      {error && <div className="mt-3 rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>}

      {stats && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Average rating</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight flex items-center gap-1.5">
              {stats.averageRating.toFixed(1) || "—"}
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total reviews</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{stats.total}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Positive (4★+)</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{stats.total ? Math.round((stats.positive / stats.total) * 100) : 0}%</p>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {reviews.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <Star className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No reviews yet. Complete jobs to earn ratings.</p>
          </div>
        ) : reviews.map((r) => (
          <div key={r.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {r.customer_name || "Customer"} · {r.service_category?.replace("_", " ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
