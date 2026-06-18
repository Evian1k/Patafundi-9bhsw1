import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SiteLayout from "@/components/layout/SiteLayout";
import { apiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin } from "lucide-react";

type Fundi = { id: string; name: string; location?: string | null; skills: string[]; experienceYears: number; rating: number; reviewCount: number };

export default function ServicePage() {
  const { slug = "" } = useParams();
  const [service, setService] = useState<{ slug: string; name: string; description: string } | null>(null);
  const [fundis, setFundis] = useState<Fundi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiClient.request(`/services/${slug}`, { includeAuth: false }) as { service?: typeof service; fundis?: Fundi[] };
        if (!cancelled) { setService(data.service || null); setFundis(data.fundis || []); }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load service");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/" className="text-sm text-primary hover:underline mb-6 inline-block">← Back to Home</Link>
        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded animate-shimmer" />)}</div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : service ? (
          <>
            <div className="mb-8">
              <h1 className="text-4xl font-display font-bold mb-3">{service.name}</h1>
              <p className="text-muted-foreground mb-4">{service.description}</p>
              <Link to={`/create-job?service=${encodeURIComponent(service.name)}`}>
                <Button className="bg-gradient-primary">Request this service</Button>
              </Link>
            </div>
            <h2 className="font-semibold text-xl mb-4">Available Fundis</h2>
            {fundis.length === 0 ? (
              <div className="p-6 bg-muted rounded-2xl text-center">
                <p className="text-muted-foreground text-sm mb-2">No verified Fundis available for this service right now.</p>
                <p className="text-muted-foreground text-xs">You can still create a job request and we'll notify nearby professionals as they come online.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {fundis.map((f) => (
                  <div key={f.id} className="p-5 bg-card rounded-2xl border border-border/50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{f.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span>{f.location || "Nearby"}</span>
                          <span>•</span>
                          <span>{f.experienceYears} yrs experience</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-semibold text-sm">{f.rating > 0 ? f.rating : "New"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{f.reviewCount ? `${f.reviewCount} reviews` : "No reviews yet"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(f.skills || []).slice(0, 6).map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </SiteLayout>
  );
}
