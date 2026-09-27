import { useEffect, useState } from "react";
import SiteLayout from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { SERVICE_CATALOG, bookingPathForService, type ServiceCategory } from "@/config/services";

/**
 * Public Services index (spec §44): every service PataFundi offers, browsable
 * without an account. Each service goes straight into the booking flow (§11).
 * The catalog is the same production config the booking wizard uses, so this
 * page can never drift from what is actually bookable.
 */
export default function ServicesIndex() {
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<ServiceCategory[]>(SERVICE_CATALOG);

  useEffect(() => {
    // Debounced client-side filter over the static catalog (spec §63: no
    // request storm; the dataset is small enough to filter locally).
    const t = setTimeout(() => {
      const q = query.trim().toLowerCase();
      if (!q) {
        setFiltered(SERVICE_CATALOG);
        return;
      }
      setFiltered(
        SERVICE_CATALOG.filter((s) => s.name.toLowerCase().includes(q)),
      );
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h1 className="text-4xl font-display font-bold mb-4">Services</h1>
          <p className="text-muted-foreground text-lg mb-6">
            Every service below is handled by verified professionals. Pick one to describe your problem and get matched - no account needed to browse.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services - plumbing, wiring, cleaning..."
              className="pl-10"
              aria-label="Search services"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50 max-w-lg mx-auto">
            <p className="font-medium mb-2">No service matches "{query}"</p>
            <p className="text-sm text-muted-foreground mb-4">
              Try a different word - or describe your problem directly and our matching will find the right category.
            </p>
            <Button asChild>
              <Link to="/create-job">Describe your problem instead</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((service) => (
              <Link
                key={service.id}
                to={bookingPathForService(service.name)}
                className="group p-5 bg-card rounded-2xl border border-border/50 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <h2 className="font-semibold mb-1 group-hover:text-primary transition-colors">{service.name}</h2>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {`Verified ${service.name.toLowerCase()} professionals near you.`}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-3">
            Looking for a company with a team for bigger jobs?
          </p>
          <Button variant="outline" asChild>
            <Link to="/companies">Browse service companies</Link>
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
