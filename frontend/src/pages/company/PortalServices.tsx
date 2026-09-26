/** Company Services catalog (spec §8) — customer-safe storefront services. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Wrench, X } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Service { id: string; name: string; category: string; description?: string; base_price?: string | number; duration_minutes?: number; is_active: boolean }

export default function PortalServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState({ name: "", category: "plumbing", description: "", basePrice: "", durationMinutes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [svc, me] = await Promise.all([
        apiClient.request("/company/portal/services") as Promise<{ services?: Service[] }>,
        apiClient.request("/company/portal/overview") as Promise<{ myRole?: string }>,
      ]);
      setServices(svc.services || []);
      setCanEdit(["owner", "manager", "admin"].includes(me.myRole || ""));
    } catch {
      setError("Unable to load services.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true); setNotice(null);
    try {
      await apiClient.request("/company/portal/services", {
        method: "POST",
        body: {
          name: form.name, category: form.category, description: form.description || undefined,
          basePrice: form.basePrice ? Number(form.basePrice) : undefined,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        },
      });
      setAddOpen(false);
      setForm({ name: "", category: "plumbing", description: "", basePrice: "", durationMinutes: "" });
      setNotice("Service published."); await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Could not add service");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: Service) => {
    try {
      await apiClient.request(`/company/portal/services/${s.id}`, { method: "PATCH", body: { isActive: !s.is_active } });
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Update failed");
    }
  };

  const del = async (s: Service) => {
    try {
      await apiClient.request(`/company/portal/services/${s.id}`, { method: "DELETE" });
      setNotice("Service removed."); await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">What customers can book from your company profile.</p>
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 w-fit">
            <Plus className="h-4 w-4" /> Add service
          </button>
        )}
      </div>

      {notice && <div className="mt-3 rounded-xl border bg-primary/100/5 text-sm px-3 py-2 text-primary">{notice}</div>}
      {error && <div className="mt-3 rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>}

      {addOpen && (
        <div className="mt-4 rounded-2xl border bg-card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Service name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="Leaking Pipe Repair" />
            </div>
            <div>
              <label className="text-sm font-medium">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize">
                {["plumbing", "electrical", "hvac", "appliance_repair", "carpentry", "cleaning", "painting", "welding"].map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Base price (KES)</label>
              <input type="number" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="3500" />
            </div>
            <div>
              <label className="text-sm font-medium">Duration (minutes)</label>
              <input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="90" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          </div>
          <button onClick={add} disabled={busy || !form.name}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Publish service
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid sm:grid-cols-2 gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : services.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-card p-10 text-center">
          <Wrench className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No services published yet.</p>
        </div>
      ) : (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {services.map((s) => (
            <div key={s.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    {s.category.replace("_", " ")}{s.duration_minutes ? ` · ~${s.duration_minutes} min` : ""}
                  </p>
                </div>
                {s.base_price ? <p className="text-sm font-semibold whitespace-nowrap">KES {Number(s.base_price).toLocaleString()}</p> : null}
              </div>
              {s.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => toggle(s)} className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
                    {s.is_active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => del(s)} className="rounded-lg border px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/5 inline-flex items-center gap-1">
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
