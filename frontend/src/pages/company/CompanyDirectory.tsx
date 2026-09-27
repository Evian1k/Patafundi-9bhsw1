/**
 * Public company directory (spec §5) — real data from GET /api/companies.
 * Customers clearly see verified professional companies vs individual fundis.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Building2, ChevronRight, MapPin, Search, Star, Users } from "lucide-react";
import { apiClient } from "@/lib/api";

interface DirectoryCompany {
  id: string; companyName: string; description?: string; logoUrl?: string;
  businessCategories: string[]; serviceAreas: string[]; rating?: number;
  completedJobs?: number; teamSize?: number; availability?: string;
  verificationStatus?: string; branches?: { name?: string }[];
}

const CATEGORIES = ["all", "plumbing", "electrical", "hvac", "appliance_repair"];

export default function CompanyDirectory() {
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams();
        if (category !== "all") params.set("category", category);
        if (search) params.set("search", search);
        const res = await apiClient.request(`/companies?${params}`, { includeAuth: false });
        if (!cancelled) setCompanies(((res as { companies?: DirectoryCompany[] }).companies) || []);
      } catch {
        if (!cancelled) setError("Unable to load companies. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category, search]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="font-semibold tracking-tight shrink-0">PataFundi <span className="text-emerald-500">Companies</span></Link>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…" aria-label="Search companies"
              className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
          <Link to="/partner-program" className="hidden sm:inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 shrink-0">
            Partner with us
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Verified service companies</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Professional companies - vetted by PataFundi, rated by real customers.
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors ${
                  category === c ? "bg-primary text-primary-foreground border-emerald-600" : "hover:bg-muted"}`}>
                {c.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-3xl border bg-card animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-10 rounded-2xl border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="mt-10 rounded-2xl border bg-card p-8 text-center">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No companies found{category !== "all" ? " in this category" : ""} yet.</p>
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => (
              <Link key={c.id} to={`/companies/${c.id}`}
                className="group rounded-3xl border bg-card p-5 hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified Partner
                  </span>
                </div>
                <h2 className="mt-3 font-semibold tracking-tight group-hover:text-primary transition-colors">{c.companyName}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {c.rating?.toFixed(1) || "New"}
                  </span>
                  {typeof c.completedJobs === "number" && <span>{c.completedJobs.toLocaleString()} completed jobs</span>}
                  {typeof c.teamSize === "number" && c.teamSize > 0 && (
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.teamSize} techs</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2 flex-1">
                  {c.description || "Professional services company."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(c.businessCategories || []).slice(0, 3).map((b) => (
                    <span key={b} className="rounded-full border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">{b.replace("_", " ")}</span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {(c.serviceAreas || [])[0] || "Kenya"}
                    {(c.serviceAreas || []).length > 1 && ` +${c.serviceAreas.length - 1}`}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-primary font-medium">
                    View <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
