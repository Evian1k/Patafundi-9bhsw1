/** Schedule (spec §9) — scheduled jobs + technician availability/workload. */
import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { apiClient } from "@/lib/api";
import { StatusChip } from "./PortalDashboard";

interface ScheduledJob { id: string; status: string; service_category: string; scheduled_at: string; urgency: string; technician_name?: string; customer_name?: string; location_name?: string }
interface Availability { id: string; fullName: string; role: string; isAvailable: boolean; skills: string[]; workload: number }

export default function PortalSchedule() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/schedule") as { scheduledJobs?: ScheduledJob[]; availability?: Availability[] };
        setJobs(res.scheduledJobs || []);
        setAvailability(res.availability || []);
      } catch {
        setError("Unable to load schedule.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="max-w-6xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;
  }
  if (error) {
    return <div className="max-w-6xl rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>;
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Upcoming scheduled work and your team's availability.</p>

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <section aria-labelledby="sched-h">
          <h2 id="sched-h" className="text-lg font-semibold tracking-tight mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Scheduled jobs
          </h2>
          {jobs.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No scheduled jobs.</div>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <div key={j.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-sm capitalize">{j.service_category?.replace("_", " ")}</p>
                    <StatusChip status={j.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(j.scheduled_at).toLocaleString()}</span>
                    {j.technician_name && <span className="text-primary">tech: {j.technician_name}</span>}
                    {j.customer_name && <span>customer: {j.customer_name}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="avail-h">
          <h2 id="avail-h" className="text-lg font-semibold tracking-tight mb-3">Technician availability</h2>
          {availability.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No team members yet.</div>
          ) : (
            <div className="rounded-2xl border bg-card divide-y overflow-hidden">
              {availability.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{a.fullName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {a.role} · {a.workload} active job{a.workload === 1 ? "" : "s"}
                      {a.skills?.length ? ` · ${a.skills.join(", ")}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${a.isAvailable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {a.isAvailable ? "Available" : "Off duty"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
