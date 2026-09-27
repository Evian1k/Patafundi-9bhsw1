import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, RefreshCw, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BackBar from "@/components/layout/BackBar";
import { apiClient } from "@/lib/api";
import { bootstrapAuthSessionFromUser, resolveAuthRole } from "@/lib/authSession";

type FavoriteRow = {
  fundi_user_id: string;
  full_name: string | null;
  skills?: string[] | null;
  rating?: number | string | null;
  approval_status?: string | null;
  favorited_at?: string | null;
};

export default function Favorites() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FavoriteRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiClient.listFavoriteFundis()) as { favorites?: FavoriteRow[] };
      setRows(res?.favorites ?? []);
    } catch {
      setError("Could not load your saved providers. Please try again.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const userData = await apiClient.getCurrentUser();
        if (!active) return;
        bootstrapAuthSessionFromUser(userData.user);
        const role = resolveAuthRole(userData.user);
        if (role === "admin") { navigate("/admin/dashboard"); return; }
        if (role === "fundi") { navigate("/fundi"); return; }
        if (role === "fundi_pending") { navigate("/fundi/pending"); return; }
        if (String(userData.user?.role || "").toLowerCase() === "company_admin") { navigate("/company"); return; }
        load();
      } catch {
        if (active) navigate("/auth");
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const remove = async (fundiUserId: string) => {
    try {
      await apiClient.removeFavoriteFundi(fundiUserId);
      setRows((prev) => (prev || []).filter((r) => r.fundi_user_id !== fundiUserId));
      toast.success("Removed from saved providers");
    } catch {
      toast.error("Could not remove this provider");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BackBar to="/dashboard" label="Home" className="mb-3" />
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display font-bold text-2xl">Saved Providers</h1>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button variant="outline" onClick={load}>Try again</Button>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">No saved providers yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              When you find a fundi you like, save them here to book again faster.
            </p>
            <Link to="/create-job"><Button className="bg-gradient-primary">Find a professional</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.fundi_user_id} className="bg-card rounded-2xl border border-border/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{r.full_name || "Fundi"}</p>
                    {r.approval_status === "approved" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {(r.skills && r.skills.length ? r.skills.join(", ") : "Professional")}
                    {r.rating != null && Number(r.rating) > 0 ? ` · ${Number(r.rating).toFixed(1)}★` : ""}
                  </p>
                </div>
                <Link to={`/fundis/${r.fundi_user_id}`} className="shrink-0">
                  <Button variant="outline" size="sm">View</Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(r.fundi_user_id)}
                  className="shrink-0 text-destructive hover:text-destructive"
                  aria-label="Remove from saved"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
