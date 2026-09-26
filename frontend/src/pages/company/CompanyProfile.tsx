/**
 * Public company profile — customer-safe data only (spec §5).
 * NEVER exposes settlements, commission, payroll, internal notes.
 * Booking posts a company-attached job via POST /api/jobs.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck, Building2, Calendar, MapPin, Phone, ShieldCheck,
  Star, Users, Wrench,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface ProfileCompany {
  id: string; companyName: string; description?: string; logoUrl?: string;
  businessCategories: string[]; serviceAreas: string[];
  branches: { name?: string; address?: string; phone?: string }[];
  rating?: number; completedJobs?: number; activeJobs?: number;
  guarantees?: { name: string; terms?: string; durationDays?: number }[];
  website?: string; verificationStatus?: string;
}
interface ServiceItem { id: string; name: string; category: string; description?: string; basePrice?: string | number; durationMinutes?: number }
interface ReviewItem { id: string; rating: number; comment?: string; reviewer_name?: string; service_category?: string; created_at: string }

export default function CompanyProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<ProfileCompany | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookMsg, setBookMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await apiClient.request(`/companies/${id}`, { includeAuth: false }) as {
          company?: ProfileCompany; services?: ServiceItem[]; reviews?: ReviewItem[];
        };
        if (cancelled) return;
        setCompany(res.company || null);
        setServices(res.services || []);
        setReviews(res.reviews || []);
      } catch {
        if (!cancelled) setError("Unable to load this company. It may not be available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const book = (service?: ServiceItem) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      sessionStorage.setItem("pf_booking_company", id || "");
      navigate("/auth?mode=login&next=" + encodeURIComponent(`/companies/${id}`));
      return;
    }
    // Send the customer into the booking wizard with this company preselected
    // (spec §2/§24): the wizard captures the customer's real location and the
    // server prices the job — the client never fabricates coordinates or prices.
    const params = new URLSearchParams({ company: id || "" });
    if (service?.category) params.set("service", service.name);
    navigate(`/create-job?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="h-40 rounded-3xl border bg-card animate-pulse" />
          <div className="mt-6 h-6 w-1/3 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }
  if (error || !company) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-3xl border bg-card p-8 text-center max-w-sm">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{error || "Company not found."}</p>
          <Link to="/companies" className="mt-4 inline-block rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm">Browse companies</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/companies" className="text-sm text-muted-foreground hover:text-foreground">← All companies</Link>
          <Link to="/partner-program" className="text-xs text-muted-foreground hover:text-foreground">Own a company?</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <div className="space-y-6 min-w-0">
          <section className="rounded-3xl border bg-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center shrink-0">
                {company.logoUrl
                  ? <img src={company.logoUrl} alt={company.companyName} className="w-16 h-16 rounded-3xl object-cover" />
                  : <Building2 className="h-7 w-7 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{company.companyName}</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified Partner
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {company.rating?.toFixed(1) || "New"}
                  </span>
                  <span>{(company.completedJobs || 0).toLocaleString()} completed jobs</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Professional team</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{company.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(company.businessCategories || []).map((b) => (
                    <span key={b} className="rounded-full border px-2.5 py-0.5 text-xs capitalize">{b.replace("_", " ")}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="services-h">
            <h2 id="services-h" className="text-lg font-semibold tracking-tight mb-3">Services</h2>
            {services.length === 0 ? (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">No published services yet — request a general booking.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {services.map((s) => (
                  <div key={s.id} className="rounded-2xl border bg-card p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">{s.category.replace("_", " ")}{s.durationMinutes ? ` · ~${s.durationMinutes} min` : ""}</p>
                      </div>
                      {s.basePrice ? <p className="text-sm font-semibold whitespace-nowrap">KES {Number(s.basePrice).toLocaleString()}</p> : null}
                    </div>
                    {s.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                    <button onClick={() => book(s)} disabled={booking}
                      className="mt-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 disabled:opacity-50">
                      Book this service
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="reviews-h">
            <h2 id="reviews-h" className="text-lg font-semibold tracking-tight mb-3">Customer reviews</h2>
            {reviews.length === 0 ? (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">No reviews yet.</div>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                    <p className="mt-1.5 text-xs text-muted-foreground">{r.reviewer_name} · {r.service_category?.replace("_", " ")}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="rounded-3xl border bg-card p-5">
            <p className="text-sm font-medium">Book {company.companyName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your request goes directly to the company's dispatch team. You'll get a
              confirmation and a named technician before work starts.
            </p>
            <button onClick={() => book()} disabled={booking}
              className="mt-3 w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {booking ? "Sending…" : "Request service"}
            </button>
            {bookMsg && <p className="mt-2 text-xs text-primary">{bookMsg}</p>}
          </div>

          <div className="rounded-3xl border bg-card p-5 space-y-3 text-sm">
            <p className="font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Service areas</p>
            <p className="text-muted-foreground text-xs">{(company.serviceAreas || []).join(" · ") || "Kenya"}</p>
            {(company.branches || []).length > 0 && (
              <>
                <p className="font-medium flex items-center gap-2 pt-1"><Building2 className="h-4 w-4 text-primary" /> Branches</p>
                {company.branches.map((b, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    <p className="text-foreground font-medium">{b.name}</p>
                    {b.address && <p>{b.address}</p>}
                  </div>
                ))}
              </>
            )}
          </div>

          {(company.guarantees || []).length > 0 && (
            <div className="rounded-3xl border bg-card p-5 space-y-2 text-sm">
              <p className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Guarantees & warranties</p>
              {company.guarantees.map((g, i) => (
                <div key={i} className="text-xs">
                  <p className="font-medium">{g.name}{g.durationDays ? ` · ${g.durationDays} days` : ""}</p>
                  {g.terms && <p className="text-muted-foreground mt-0.5">{g.terms}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-3xl border bg-card p-5 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-2 text-foreground font-medium"><Calendar className="h-4 w-4 text-primary" /> How it works</p>
            <p>1. Send a request — describe the job.</p>
            <p>2. The company accepts and dispatches a technician.</p>
            <p>3. Approve the quote, then pay through secure escrow.</p>
            <p>4. Confirm completion with an OTP — funds release only then.</p>
          </div>

          <div className="rounded-3xl border bg-primary/100/5 p-5 text-xs text-muted-foreground flex gap-2">
            <Wrench className="h-4 w-4 text-primary shrink-0" />
            Looking for an individual fundi instead? Individual professionals also appear
            in search results and can be booked directly.
          </div>
        </aside>
      </main>
    </div>
  );
}
