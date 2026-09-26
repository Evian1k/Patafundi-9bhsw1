/** Company Settings (spec §8 MY BUSINESS) — profile, areas, branches, availability. */
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Profile {
  id: string; companyName: string; legalName?: string; description?: string; logoUrl?: string;
  businessCategories: string[]; serviceAreas: string[];
  branches: { name?: string; address?: string }[]; availability?: string;
  website?: string; guarantees?: { name: string; terms?: string }[];
  rating?: number; completedJobs?: number;
}

export default function PortalSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myRole, setMyRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "", legalName: "", description: "", website: "",
    serviceAreas: "", branches: "", availability: "available",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request("/company/portal/profile") as { company?: Profile; myRole?: string };
        const c = res.company;
        setProfile(c || null);
        setMyRole(res.myRole || "");
        if (c) setForm({
          companyName: c.companyName || "", legalName: c.legalName || "",
          description: c.description || "", website: c.website || "",
          serviceAreas: (c.serviceAreas || []).join(", "),
          branches: (c.branches || []).map((b) => b.name || b.address || "").filter(Boolean).join("\n"),
          availability: c.availability || "available",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      await apiClient.request("/company/portal/profile", {
        method: "PUT",
        body: {
          companyName: form.companyName,
          legalName: form.legalName || undefined,
          description: form.description || undefined,
          website: form.website || undefined,
          serviceAreas: form.serviceAreas.split(",").map((s) => s.trim()).filter(Boolean),
          branches: form.branches.split("\n").map((s) => s.trim()).filter(Boolean).map((b) => ({ name: b })),
          availability: form.availability,
        },
      });
      setNotice("Profile saved.");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="max-w-4xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;

  const canEdit = ["owner", "manager", "admin"].includes(myRole);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">My business</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Customer-facing profile — keep it accurate and complete.</p>

      {notice && <div className="mt-3 rounded-xl border bg-emerald-500/5 text-sm px-3 py-2 text-emerald-700">{notice}</div>}

      <div className="mt-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} disabled={!canEdit} />
          <Field label="Legal name" value={form.legalName} onChange={(v) => setForm({ ...form, legalName: v })} disabled={!canEdit} />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm disabled:opacity-60" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Service areas (comma separated)" value={form.serviceAreas} onChange={(v) => setForm({ ...form, serviceAreas: v })} disabled={!canEdit} />
          <div>
            <label className="text-sm font-medium">Customer-safe availability</label>
            <select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} disabled={!canEdit}
              className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize disabled:opacity-60">
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Branches (one per line)</label>
          <textarea rows={3} value={form.branches} onChange={(e) => setForm({ ...form, branches: e.target.value })} disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm disabled:opacity-60" />
        </div>

        {profile && (
          <div className="rounded-2xl border bg-emerald-500/5 p-4 text-xs text-muted-foreground grid grid-cols-3 gap-3">
            <div><p className="font-medium text-foreground capitalize">Status</p>{profile.verificationStatus || "—"}</div>
            <div><p className="font-medium text-foreground">Rating</p>{profile.rating?.toFixed(1) || "—"}</div>
            <div><p className="font-medium text-foreground">Completed jobs</p>{(profile.completedJobs || 0).toLocaleString()}</div>
          </div>
        )}

        {canEdit ? (
          <button onClick={save} disabled={saving || !form.companyName}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Only owners and managers can edit the business profile.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm disabled:opacity-60" />
    </div>
  );
}
