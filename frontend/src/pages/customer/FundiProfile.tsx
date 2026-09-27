import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CalendarClock, MessageSquare, Star, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api";

type FundiProfile = {
  id: string;
  user_id: string;
  name?: string | null;
  full_name?: string | null;
  skills?: string[] | null;
  rating?: number | null;
  trustScore?: number | null;
  approval_status?: string | null;
  verified?: boolean;
  verificationBadge?: boolean;
  profilePhotoUrl?: string | null;
  bio?: string | null;
  experience?: string | null;
  completedJobs?: number | null;
  reviewCount?: number | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  reviewer_name?: string | null;
};

export default function FundiProfile() {
  const { fundiId = "" } = useParams();
  const navigate = useNavigate();
  const [fundi, setFundi] = useState<FundiProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getFundi(fundiId) as Promise<{ fundi?: FundiProfile }>,
      apiClient.getReviewsForFundi(fundiId, 10, 0) as Promise<{ reviews?: ReviewRow[] }>,
    ])
      .then(([fRes, rRes]) => {
        if (!active) return;
        if (!fRes?.fundi) {
          setError("This professional could not be found.");
        } else {
          setFundi(fRes.fundi);
          setReviews(rRes?.reviews ?? []);
        }
      })
      .catch(() => {
        if (active) setError("Could not load this profile. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fundiId]);

  const name = fundi?.name || fundi?.full_name || "Fundi";
  const rating = fundi?.rating != null && Number(fundi.rating) > 0 ? Number(fundi.rating) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !fundi) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-destructive mb-3">{error || "Profile not found."}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Identity card */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              {fundi.profilePhotoUrl ? (
                <img src={fundi.profilePhotoUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                <Wrench className="w-7 h-7 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-bold text-xl">{name}</h1>
                {fundi.verified && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
              {fundi.skills && fundi.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {fundi.skills.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-muted">{s}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="inline-flex items-center gap-1">
                  {rating != null ? (
                    <>
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">{rating.toFixed(1)}</span>
                      <span className="text-muted-foreground text-xs">
                        ({fundi.reviewCount ?? 0} review{(fundi.reviewCount ?? 0) === 1 ? "" : "s"})
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-muted">New fundi</span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="w-4 h-4" />
                  {fundi.completedJobs ?? 0} jobs completed
                </span>
              </div>
            </div>
          </div>

          {(fundi.bio || fundi.experience) && (
            <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
              {fundi.bio && <p className="text-sm text-muted-foreground">{fundi.bio}</p>}
              {fundi.experience && (
                <p className="text-sm"><span className="font-medium">Experience: </span>{fundi.experience}</p>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Link to={`/create-job?fundi=${fundi.user_id || fundi.id}`} className="flex-1">
              <Button className="w-full bg-gradient-primary">Book this fundi</Button>
            </Link>
          </div>
        </div>

        {/* Reviews */}
        <div className="bg-card rounded-2xl border border-border/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Reviews</h2>
          </div>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviews yet — be the first to leave one after booking.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i <= Number(r.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                    {r.created_at && (
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {r.comment && <p className="text-sm mt-1">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
