/**
 * Fundi My Reviews — the fundi's own rating history (spec §5 "view ratings").
 * Reads GET /fundi/:userId/reviews (public endpoint scoped to this fundi).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import TrustBadge from "@/components/ui/TrustBadge";

interface ReviewRow {
  id?: string;
  rating?: number;
  comment?: string | null;
  provider_reply?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  created_at?: string;
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

export default function FundiMyReviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  const saveReply = async (reviewId: string) => {
    if (replyText.trim().length < 2) {
      toast.error("Write a short reply first.");
      return;
    }
    setReplySaving(true);
    try {
      await apiClient.replyToReview(reviewId, replyText.trim());
      toast.success("Reply posted.");
      setReplyFor(null);
      setReplyText("");
      // Refresh list so the reply shows immediately
      const res = await apiClient.getFundiRatings(50, 0) as { ratings?: ReviewRow[] };
      setReviews(res.ratings || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post reply");
    } finally {
      setReplySaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // /fundi/ratings resolves the signed-in fundi server-side (optionalAuth).
        const res = await apiClient.getFundiRatings(50, 0) as { ratings?: ReviewRow[] };
        setReviews(Array.isArray(res?.ratings) ? res.ratings : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your reviews");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const average = reviews.length
    ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length
    : null;

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/fundi")} className="p-2 hover:bg-muted rounded-xl" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-display font-bold">My Reviews</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="bg-card rounded-2xl p-5 border border-border/50 flex items-center gap-4">
              <div className="text-4xl font-display font-bold text-primary">
                {average ? average.toFixed(1) : "—"}
              </div>
              <div className="space-y-1">
                <Stars value={Math.round(average || 0)} />
                <p className="text-xs text-muted-foreground">
                  {reviews.length} review{reviews.length === 1 ? "" : "s"} from completed jobs
                </p>
              </div>
              <div className="ml-auto">
                <TrustBadge score={Math.round((average || 0) * 20)} size="sm" />
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className="bg-card rounded-2xl p-8 border border-border/50 text-center text-muted-foreground text-sm">
                No reviews yet — complete jobs to start building your reputation.
              </div>
            ) : (
              reviews.map((r, i) => (
                <div key={r.id || i} className="bg-card rounded-2xl p-4 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <Stars value={Number(r.rating || 0)} />
                    <span className="text-[11px] text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {r.comment && <p className="text-sm">{r.comment}</p>}
                  {r.provider_reply && (
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
                      Your reply: {r.provider_reply}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {r.customerName || r.customer_name || "Customer"}
                  </p>
                  {r.id && !r.provider_reply && replyFor !== r.id && (
                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => { setReplyFor(r.id); setReplyText(""); }}>
                      Reply to this review
                    </Button>
                  )}
                  {r.id && replyFor === r.id && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none"
                        rows={2}
                        placeholder="Thank the customer or explain your side…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setReplyFor(null)}>Cancel</Button>
                        <Button size="sm" disabled={replySaving} onClick={() => r.id && saveReply(r.id)}>
                          {replySaving ? "Posting…" : "Post reply"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
