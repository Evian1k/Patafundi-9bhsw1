import { useState, useEffect } from "react";
import { Star, Loader2, RefreshCw, EyeOff, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface AdminReview {
  id: string;
  rating: number;
  comment?: string | null;
  provider_reply?: string | null;
  hidden: boolean;
  reviewer_name?: string;
  fundi_name?: string | null;
  service_category?: string;
  provider_type?: string;
  created_at: string;
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.adminListReviews() as { reviews?: AdminReview[] };
      setReviews(res.reviews || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleHide = async (r: AdminReview) => {
    setActing(r.id);
    try {
      await apiClient.adminHideReview(r.id, !r.hidden);
      toast.success(!r.hidden ? "Review hidden — it no longer counts towards ratings." : "Review restored.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Moderation failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Reviews</h1>
            <p className="text-sm text-muted-foreground">Every review is tied to a completed job. Hidden reviews are excluded from rating aggregates.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading reviews…
          </div>
        ) : reviews.length === 0 ? (
          <Card className="p-10 text-center">
            <Star className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">No reviews yet</p>
            <p className="text-sm text-muted-foreground">Reviews appear once customers confirm completed jobs and rate them.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <Card key={r.id} className={`p-5 ${r.hidden ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-4 h-4 ${s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                        ))}
                      </div>
                      {r.hidden && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">hidden</span>}
                      <span className="text-xs text-muted-foreground">{r.service_category || "job"} · for {r.fundi_name || (r.provider_type === "company" ? "company" : "provider")}</span>
                    </div>
                    {r.comment && <p className="text-sm">"{r.comment}"</p>}
                    {r.provider_reply && (
                      <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">Provider reply: {r.provider_reply}</p>
                    )}
                    <p className="text-xs text-muted-foreground">by {r.reviewer_name || "customer"} · {new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={r.hidden ? "outline" : "ghost"}
                    disabled={acting === r.id}
                    onClick={() => toggleHide(r)}
                  >
                    {r.hidden ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                    {r.hidden ? "Restore" : "Hide"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
