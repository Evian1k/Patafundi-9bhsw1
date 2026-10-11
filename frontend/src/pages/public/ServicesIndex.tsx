import { useEffect, useMemo, useState } from "react";
import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api";
import { bookingPathForService, type ServiceCategory } from "@/config/services";

export default function ServicesIndex() {
  const [query, setQuery] = useState("");
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiClient.getServiceCategories("KE")
      .then((response) => setServices((response as { services?: ServiceCategory[] }).services || []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "The service catalog is temporarily unavailable."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((service) =>
      [service.title, service.slug, service.description || "", ...(service.aliases || [])]
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [query, services]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h1 className="text-4xl font-display font-bold mb-4">Services</h1>
          <p className="text-muted-foreground text-lg mb-6">
            Browse services currently listed for Kenya. Availability depends on your area and eligible providers’ schedules. You can also describe a service that is not listed.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services, aliases, or a problem" className="pl-10" aria-label="Search services" />
          </div>
        </div>

        {loading && <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading available services…</div>}
        {error && <div className="max-w-lg mx-auto rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center" role="alert"><p className="font-medium">Could not load services</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button></div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50 max-w-lg mx-auto">
            <p className="font-medium mb-2">{services.length ? `No catalog match for “${query}”` : "No services are currently available in this country"}</p>
            <p className="text-sm text-muted-foreground mb-4">
              For an unlisted service, submit a custom request and let a provider confirm whether they can take it and provide a quote.
            </p>
            <Button asChild><Link to={`/create-job?service=other${query.trim() ? `&problem=${encodeURIComponent(query.trim())}` : ""}`}>Describe your service</Link></Button>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((service) => (
              <Link key={service.slug} to={bookingPathForService(service.slug)} className="group p-5 bg-card rounded-2xl border border-border/50 hover:border-primary/40 hover:shadow-sm transition-all">
                <h2 className="font-semibold mb-1 group-hover:text-primary transition-colors">{service.title}</h2>
                <p className="text-sm text-muted-foreground line-clamp-2">{service.description || `Request ${service.title.toLowerCase()} from an eligible provider.`}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-3">Looking for a company with a team for bigger jobs?</p>
          <Button variant="outline" asChild><Link to="/companies">Browse service companies</Link></Button>
        </div>
      </div>
    </SiteLayout>
  );
}
