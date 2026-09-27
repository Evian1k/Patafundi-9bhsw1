/**
 * Company Team management (spec §8 TEAM) — technicians & members CRUD plus
 * the per-permission capability matrix. The server enforces capabilities on
 * every endpoint; this UI simply edits what each member can do.
 * Server-side role gating: only members with manage_team can modify.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Member {
  id: string; userId: string; fullName: string; email: string; phone?: string;
  role: string; status: string; isAvailable: boolean; skills: string[]; activeJobs: number;
  permissions: string[] | null;
}
const ROLES = ["technician", "support", "dispatcher", "finance", "manager", "admin"];

// Mirrors backend COMPANY_CAPABILITIES + COMPANY_ROLE_CAPABILITIES defaults.
const CAPABILITIES: { key: string; label: string; hint: string }[] = [
  { key: "view_overview", label: "View dashboard", hint: "See the portal dashboard, schedule and reviews" },
  { key: "handle_jobs", label: "Handle jobs", hint: "Accept, reject, quote and claim assigned work" },
  { key: "dispatch_jobs", label: "Dispatch", hint: "Assign and unassign technicians to jobs" },
  { key: "manage_services", label: "Manage services", hint: "Create and edit the service catalog" },
  { key: "manage_team", label: "Manage team", hint: "Add, suspend, remove members and edit permissions" },
  { key: "manage_settings", label: "Manage settings", hint: "Edit the business profile and payout settings" },
  { key: "view_finance", label: "View finance", hint: "See settlements, earnings and payout history" },
  { key: "request_payout", label: "Request payouts", hint: "Request settlement withdrawals to the payout account" },
];

const ROLE_DEFAULTS: Record<string, string[]> = {
  owner: CAPABILITIES.map((c) => c.key),
  manager: ["view_overview", "manage_team", "manage_services", "manage_settings", "dispatch_jobs", "handle_jobs"],
  admin: ["view_overview", "manage_team", "manage_services", "manage_settings", "dispatch_jobs", "handle_jobs"],
  dispatcher: ["view_overview", "dispatch_jobs", "handle_jobs"],
  finance: ["view_overview", "view_finance", "request_payout"],
  support: ["view_overview"],
  technician: ["view_overview", "handle_jobs"],
};

const effectivePerms = (m: Member) => (m.permissions && m.permissions.length > 0 ? m.permissions : (ROLE_DEFAULTS[m.role] || []));

export default function PortalTeam() {
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", role: "technician", skills: "" });
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [permOpenId, setPermOpenId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<string[]>([]);

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
        ? `Member added. Temporary password: ${res.temporaryPassword} - share it securely.`
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

  const openPerms = (m: Member) => {
    setPermOpenId(permOpenId === m.id ? null : m.id);
    setDraftPerms(effectivePerms(m));
  };

  const savePerms = async (m: Member) => {
    // Empty selection is rejected — reset to role defaults instead.
    await update(m, { permissions: draftPerms.length > 0 ? draftPerms : null },
      draftPerms.length > 0 ? "Permissions saved." : "Permissions reset to role defaults.");
    setPermOpenId(null);
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Technicians, dispatchers and staff - with per-person permissions.</p>
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 w-fit">
            <UserPlus className="h-4 w-4" /> Add member
          </button>
        )}
      </div>

      {notice && <div className="mt-3 rounded-xl border bg-primary/100/5 text-sm px-3 py-2 text-primary break-words">{notice}</div>}
      {error && <div className="mt-3 rounded-xl border bg-red-500/5 text-sm px-3 py-2 text-red-600">{error}</div>}

      {addOpen && (
        <div className="mt-4 rounded-2xl border bg-card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input id="new-name" label="Full name *" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
            <Input id="new-email" label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input id="new-phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="2547…" />
            <div>
              <label htmlFor="new-role" className="text-sm font-medium">Role</label>
              <select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Default permissions: {(ROLE_DEFAULTS[form.role] || []).length} - you can fine-tune after adding.
              </p>
            </div>
          </div>
          <Input id="new-skills" label="Skills (comma separated)" value={form.skills} onChange={(v) => setForm({ ...form, skills: v })} placeholder="plumbing, hvac" />
          <button onClick={add} disabled={busy || !form.fullName || !form.email}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
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
                    <span className="rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 capitalize">{m.role}</span>
                    <span className={`rounded-full text-[11px] font-medium px-2 py-0.5 capitalize ${m.status === "active" ? "bg-muted text-foreground" : "bg-red-500/10 text-red-500"}`}>{m.status}</span>
                    {m.role === "technician" && (
                      <span className="rounded-full border text-[11px] px-2 py-0.5">{m.activeJobs} active job{m.activeJobs === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  {m.skills?.length > 0 && <p className="mt-2 text-xs text-muted-foreground capitalize">{m.skills.join(" · ")}</p>}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {effectivePerms(m).length} permission{effectivePerms(m).length === 1 ? "" : "s"}
                    {m.permissions && m.permissions.length > 0 ? " (custom)" : " (role defaults)"}
                  </p>
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
                  <button onClick={() => openPerms(m)}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
                    <ShieldCheck className="h-3 w-3" /> Permissions
                  </button>
                  <select
                    aria-label={`Change role for ${m.fullName}`}
                    value={m.role}
                    onChange={(e) => update(m, { role: e.target.value }, "Role updated - review their permissions.")}
                    className="rounded-lg border bg-background px-2 py-1.5 text-xs capitalize">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
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

              {canEdit && permOpenId === m.id && (
                <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium mb-2">Permissions for {m.fullName}</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {CAPABILITIES.map((cap) => (
                      <label key={cap.key} htmlFor={`perm-${m.id}-${cap.key}`}
                        className="flex items-start gap-2 rounded-lg p-1.5 text-xs hover:bg-muted/60 cursor-pointer"
                        title={cap.hint}>
                        <input
                          id={`perm-${m.id}-${cap.key}`}
                          type="checkbox"
                          checked={draftPerms.includes(cap.key)}
                          onChange={(e) => setDraftPerms((prev) => e.target.checked ? [...prev, cap.key] : prev.filter((k) => k !== cap.key))}
                          className="mt-0.5 h-3.5 w-3.5 accent-emerald-600"
                        />
                        <span>
                          <span className="font-medium">{cap.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{cap.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => savePerms(m)} disabled={draftPerms.length === 0}
                      className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                      Save permissions
                    </button>
                    <button onClick={() => update(m, { permissions: null }, "Permissions reset to role defaults.")}
                      className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Reset to role defaults</button>
                  </div>
                  {draftPerms.length === 0 && (
                    <p className="mt-1.5 text-[10px] text-amber-600">Select at least one permission, or use “Reset to role defaults”.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ id, label, value, onChange, type = "text", placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
    </div>
  );
}
