/**
 * Company Team management (spec §8 TEAM) — technicians & members CRUD.
 * Server-side role gating: only owner/manager/admin can modify.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Users } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Member {
  id: string; userId: string; fullName: string; email: string; phone?: string;
  role: string; status: string; isAvailable: boolean; skills: string[]; activeJobs: number;
}
const ROLES = ["technician", "dispatcher", "manager", "finance"];

export default function PortalTeam() {
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", role: "technician", skills: "" });
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.request("/company/portal/team") as { team?: Member[] };
      setTeam(res.team || []);
      const me = await apiClient.request("/company/portal/overview") as { myRole?: string };
      setCanEdit(["owner", "manager", "admin"].includes(me.myRole || ""));
    } catch {
      setError("Unable to load team.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await apiClient.request("/company/portal/team", {
        method: "POST",
        body: {
          fullName: form.fullName, email: form.email, phone: form.phone || undefined,
          role: form.role,
          skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        },
      }) as { temporaryPassword?: string };
      setNotice(res.temporaryPassword
        ? `Member added. Temporary password: ${res.temporaryPassword} — share it securely.`
        : "Member added.");
      setAddOpen(false);
      setForm({ fullName: "", email: "", phone: "", role: "technician", skills: "" });
      await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  };

  const update = async (m: Member, body: Record<string, unknown>, msg: string) => {
    setNotice(null);
    try {
      await apiClient.request(`/company/portal/team/${m.id}`, { method: "PATCH", body });
      setNotice(msg); await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (m: Member) => {
    setNotice(null);
    try {
      await apiClient.request(`/company/portal/team/${m.id}`, { method: "DELETE" });
      setNotice("Member removed."); await load();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Technicians and staff who deliver work for your company.</p>
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-700 w-fit">
            <UserPlus className="h-4 w-4" /> Add member
          </button>
        )}
      </div>

      {notice && <div className="mt-3 rounded-xl border bg-emerald-500/5 text-sm px-3 py-2 text-emerald-700 break-words">{notice}</div>}
      {error && <div className="mt-3 rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>}

      {addOpen && (
        <div className="mt-4 rounded-2xl border bg-card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Full name *" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
            <Input label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="2547…" />
            <div>
              <label className="text-sm font-medium">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <Input label="Skills (comma separated)" value={form.skills} onChange={(v) => setForm({ ...form, skills: v })} placeholder="plumbing, hvac" />
          <button onClick={add} disabled={busy || !form.fullName || !form.email}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add member
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : team.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-card p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No team members yet.</p>
        </div>
      ) : (
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          {team.map((m) => (
            <div key={m.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] font-medium px-2 py-0.5 capitalize">{m.role}</span>
                    <span className={`rounded-full text-[11px] font-medium px-2 py-0.5 capitalize ${m.status === "active" ? "bg-muted text-foreground" : "bg-red-500/10 text-red-500"}`}>{m.status}</span>
                    {m.role === "technician" && (
                      <span className="rounded-full border text-[11px] px-2 py-0.5">{m.activeJobs} active job{m.activeJobs === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  {m.skills?.length > 0 && <p className="mt-2 text-xs text-muted-foreground capitalize">{m.skills.join(" · ")}</p>}
                </div>
              </div>
              {canEdit && m.role !== "owner" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.role === "technician" && (
                    <button onClick={() => update(m, { isAvailable: !m.isAvailable }, "Availability updated")}
                      className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
                      {m.isAvailable ? "Set off duty" : "Set available"}
                    </button>
                  )}
                  {m.status === "active" ? (
                    <button onClick={() => update(m, { status: "suspended" }, "Member suspended")}
                      className="rounded-lg border px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/5">Suspend</button>
                  ) : (
                    <button onClick={() => update(m, { status: "active" }, "Member reactivated")}
                      className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">Reactivate</button>
                  )}
                  <button onClick={() => remove(m)} className="rounded-lg border px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/5">Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
    </div>
  );
}
