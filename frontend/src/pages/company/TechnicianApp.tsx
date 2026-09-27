/**
 * Technician experience (spec §11) — mobile-first, only THEIR assigned work.
 * Flow: on the way → arrived → work started → completion, with GPS-validated
 * check-ins and evidence photo upload. Company administration stays in the
 * portal; customer confirmation stays with the customer (OTP never shown here).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Camera, CheckCircle2, Loader2, MapPin, Navigation, Phone, Wrench } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Assignment {
  id: string; status: string; service_category: string; description?: string;
  urgency: string; location_name?: string; scheduled_at?: string; created_at: string;
  customer_name?: string; company_name?: string;
  customer_latitude?: number | string; customer_longitude?: number | string;
}

const NEXT_ACTION: Record<string, { label: string; status: string }> = {
  assigned: { label: "On the way", status: "on_the_way" },
  on_the_way: { label: "I've arrived", status: "arrived" },
  arrived: { label: "Start work", status: "in_progress" },
};

export default function TechnicianApp() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const photoInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.request("/company/technician/assignments?scope=active") as { jobs?: Assignment[] };
      setJobs(res.jobs || []);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const advance = async (job: Assignment) => {
    const action = NEXT_ACTION[job.status];
    if (!action) return;
    setBusy(job.id); setNotice(null);
    try {
      // GPS-validated check-in (spec §19): the server records the position with
      // every transition and flags 'arrived' check-ins far from the customer.
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("no-geolocation"));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 30_000 });
      });
      await apiClient.checkInToJob(job.id, position.coords.latitude, position.coords.longitude, action.status);
      setNotice(`Status updated: ${action.status.replace(/_/g, " ")}`);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("denied") || msg.includes("no-geolocation") || msg.includes("permission")) {
        // Graceful fallback: location unavailable — plain transition, still
        // state-machine-guarded by the server.
        try {
          await apiClient.request(`/jobs/${job.id}/status`, { method: "PATCH", body: { status: action.status } });
          setNotice(`Status updated without GPS (location unavailable): ${action.status.replace(/_/g, " ")}`);
          await load();
        } catch (e2: unknown) {
          setNotice(e2 instanceof Error ? e2.message : "Update failed");
        }
      } else {
        setNotice(e instanceof Error ? e.message : "Update failed");
      }
    } finally {
      setBusy(null);
    }
  };

  const uploadEvidence = async (job: Assignment, file: File) => {
    setBusy(job.id); setNotice(null);
    try {
      const fd = new FormData();
      fd.append("photos", file);
      await apiClient.uploadJobPhoto(job.id, fd);
      setNotice("Work photo uploaded.");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const navigateTo = (job: Assignment) => {
    const lat = Number(job.customer_latitude);
    const lng = Number(job.customer_longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      window.open(`https://www.openstreetmap.org/directions?to=${lat},${lng}`, "_blank", "noopener");
    } else {
      setNotice("No location pinned for this job.");
    }
  };

  if (denied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-3xl border bg-card p-8 text-center max-w-sm">
          <Wrench className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="mt-3 font-semibold">Technician app</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is for company technicians with assigned work. Log in with your technician account.
          </p>
          <Link to="/auth" className="mt-4 inline-block rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground">← Exit</button>
          <p className="font-semibold text-sm">My work</p>
          <button onClick={load} aria-label="Refresh" className="p-2 -mr-2 rounded-lg hover:bg-muted">
            <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : "opacity-0"}`} />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {notice && <div className="rounded-xl border bg-primary/100/5 text-sm px-3 py-2 text-primary">{notice}</div>}

        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-40 rounded-3xl bg-muted animate-pulse" />)
        ) : jobs.length === 0 ? (
          <div className="rounded-3xl border bg-card p-10 text-center">
            <Briefcase className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No assigned jobs right now.</p>
            <p className="mt-1 text-xs text-muted-foreground">Your dispatcher will assign work - it appears here instantly.</p>
          </div>
        ) : jobs.map((j) => {
          const action = NEXT_ACTION[j.status];
          return (
            <div key={j.id} className="rounded-3xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold capitalize">{j.service_category?.replace("_", " ")}</h2>
                {j.urgency === "emergency" && <span className="rounded-full bg-red-500/10 text-red-500 text-[10px] font-semibold px-2 py-0.5">EMERGENCY</span>}
                <span className="rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 capitalize">{j.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{j.description}</p>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{j.location_name || "Location on file"}</p>
                {j.customer_name && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{j.customer_name} (contact via platform)</p>}
                {j.scheduled_at && <p>Scheduled: {new Date(j.scheduled_at).toLocaleString()}</p>}
              </div>
              <div className="mt-4 flex gap-2">
                {action ? (
                  <button onClick={() => advance(j)} disabled={busy === j.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {busy === j.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                    {action.label}
                  </button>
                ) : j.status === "in_progress" ? (
                  <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-muted py-3 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> Complete via customer OTP
                  </span>
                ) : null}
                {j.status === "in_progress" && (
                  <>
                    <input
                      ref={(el) => { photoInputsRef.current[j.id] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadEvidence(j, file);
                        e.target.value = "";
                      }}
                    />
                    <button onClick={() => photoInputsRef.current[j.id]?.click()} disabled={busy === j.id}
                      className="rounded-xl border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50" aria-label="Upload work photo">
                      {busy === j.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                  </>
                )}
                <button onClick={() => navigateTo(j)}
                  className="rounded-xl border px-4 py-3 text-sm font-medium hover:bg-muted" aria-label="Navigate to job">
                  <Navigation className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </main>

      <nav className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] max-w-lg mx-auto" aria-label="Technician navigation">
        <div className="grid grid-cols-2">
          <Link to="/technician" className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-primary">
            <Briefcase className="h-5 w-5" /> My jobs
          </Link>
          <Link to="/dashboard" className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-muted-foreground">
            <MapPin className="h-5 w-5" /> Main app
          </Link>
        </div>
      </nav>
    </div>
  );
}
