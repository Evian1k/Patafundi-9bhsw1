/** Company Settings (spec §8 MY BUSINESS) — profile, areas, branches, availability, payout destination. */
import { useEffect, useState } from "react";
import { Banknote, Loader2, Save, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api";

interface Profile {
  id: string; companyName: string; legalName?: string; description?: string; logoUrl?: string;
  businessCategories: string[]; serviceAreas: string[];
  branches: { name?: string; address?: string }[]; availability?: string;
  website?: string; guarantees?: { name: string; terms?: string }[];
  rating?: number; completedJobs?: number;
  verificationStatus?: string;
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
  const [payout, setPayout] = useState({ method: "mpesa", mpesaNumber: "", bankName: "", bankAccount: "", accountName: "" });
  const [payoutMasked, setPayoutMasked] = useState<string | null>(null);
  const [payoutSaving, setPayoutSaving] = useState(false);
  // Verification & documents (spec sections 19-21) + branding (section 20)
  const [docs, setDocs] = useState<{
    documents: { id: string; documentType: string; status: string; originalName?: string; rejectionReason?: string | null }[];
    requiredDocuments: string[];
    missingDocuments: string[];
    verificationStatus: string;
  } | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [brandingBusy, setBrandingBusy] = useState(false);

  const loadDocs = async () => {
    try {
      const res = await apiClient.request("/company/documents") as {
        documents?: { id: string; documentType: string; status: string; originalName?: string; rejectionReason?: string | null }[];
        requiredDocuments?: string[];
        missingDocuments?: string[];
        verificationStatus?: string;
      };
      setDocs({
        documents: res.documents || [],
        requiredDocuments: res.requiredDocuments || [],
        missingDocuments: res.missingDocuments || [],
        verificationStatus: res.verificationStatus || "unverified",
      });
    } catch {
      setDocs(null);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  const uploadDocument = async (documentType: string, file: File) => {
    setDocBusy(true); setNotice(null);
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("documentType", documentType);
      await apiClient.upload("/company/documents", fd);
      await loadDocs();
      setNotice(`${documentType.replace(/_/g, " ")} uploaded for review.`);
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setDocBusy(false);
    }
  };

  const submitVerification = async () => {
    setDocBusy(true); setNotice(null);
    try {
      await apiClient.request("/company/verification/submit", { method: "POST" });
      await loadDocs();
      setNotice("Submitted for verification. Our team will review your documents and notify you.");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setDocBusy(false);
    }
  };

  const uploadBranding = async (field: "logo" | "cover", file: File) => {
    setBrandingBusy(true); setNotice(null);
    try {
      const fd = new FormData();
      fd.append(field, file);
      const res = await apiClient.upload("/company/branding", fd) as { branding?: { logoUrl?: string } };
      if (res?.branding?.logoUrl) setProfile((p) => (p ? { ...p, logoUrl: res.branding!.logoUrl } : p));
      setNotice(field === "logo" ? "Logo updated." : "Profile image updated.");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBrandingBusy(false);
    }
  };

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
        // Payout destination (masked) from the finance endpoint — owners only.
        try {
          const fin = await apiClient.request("/company/portal/finance") as { payoutAccount?: { method: string; mpesaNumber?: string; bankName?: string; bankAccount?: string; accountName?: string } };
          if (fin.payoutAccount) {
            setPayout((p) => ({
              ...p,
              method: fin.payoutAccount!.method || "mpesa",
              accountName: fin.payoutAccount!.accountName || "",
            }));
            setPayoutMasked(fin.payoutAccount.method === "bank"
              ? `${fin.payoutAccount.bankName || "bank"} ${fin.payoutAccount.bankAccount ?? ""}`
              : `M-Pesa ${fin.payoutAccount.mpesaNumber ?? "not set"}`);
          }
        } catch { /* finance roles only - ignore */ }
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

  const savePayout = async () => {
    setPayoutSaving(true); setNotice(null);
    try {
      const res = await apiClient.request("/company/portal/finance/payout-destination", {
        method: "PUT",
        body: {
          method: payout.method,
          mpesaNumber: payout.method === "mpesa" && payout.mpesaNumber ? payout.mpesaNumber : undefined,
          bankName: payout.method === "bank" && payout.bankName ? payout.bankName : undefined,
          bankAccount: payout.method === "bank" && payout.bankAccount ? payout.bankAccount : undefined,
          accountName: payout.accountName || undefined,
        },
      }) as { payoutAccount?: { method: string; mpesaNumber?: string; bankName?: string; bankAccount?: string } };
      setPayout((p) => ({ ...p, mpesaNumber: "", bankAccount: "" }));
      if (res.payoutAccount) {
        setPayoutMasked(res.payoutAccount.method === "bank"
          ? `${res.payoutAccount.bankName || "bank"} ${res.payoutAccount.bankAccount ?? ""}`
          : `M-Pesa ${res.payoutAccount.mpesaNumber ?? "not set"}`);
      }
      setNotice("Payout destination saved.");
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPayoutSaving(false);
    }
  };

  if (loading) return <div className="max-w-4xl"><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;

  const canEdit = ["owner", "manager", "admin"].includes(myRole);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">My business</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Customer-facing profile - keep it accurate and complete.</p>

      {notice && <div className="mt-3 rounded-xl border bg-primary/100/5 text-sm px-3 py-2 text-primary">{notice}</div>}

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
          <div className="rounded-2xl border bg-primary/100/5 p-4 text-xs text-muted-foreground grid grid-cols-3 gap-3">
            <div><p className="font-medium text-foreground capitalize">Status</p>{profile.verificationStatus || "Not set"}</div>
            <div><p className="font-medium text-foreground">Rating</p>{profile.rating?.toFixed(1) || "Not set"}</div>
            <div><p className="font-medium text-foreground">Completed jobs</p>{(profile.completedJobs || 0).toLocaleString()}</div>
          </div>
        )}

        {/* ── Branding: logo + profile image (spec section 20) ── */}
        {canEdit && (
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-medium">Company images</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload your logo and a profile image. These appear on your public profile and booking cards.
            </p>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Logo</label>
                <input type="file" accept="image/*" disabled={brandingBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBranding("logo", f); }}
                  className="mt-1 block w-full text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium">Profile / cover image</label>
                <input type="file" accept="image/*" disabled={brandingBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBranding("cover", f); }}
                  className="mt-1 block w-full text-xs" />
              </div>
            </div>
            {brandingBusy && <Loader2 className="mt-2 h-4 w-4 animate-spin text-primary" />}
          </div>
        )}

        {/* ── Verification & documents (spec sections 19-21) ── */}
        {canEdit && docs && (
          <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Verification documents</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  Verification status: {docs.verificationStatus.replace(/_/g, " ")}
                </p>
              </div>
              <button onClick={submitVerification} disabled={docBusy || docs.missingDocuments.length > 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
                {docBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Submit for verification
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {docs.requiredDocuments.map((type) => {
                const existing = docs.documents.find((d) => d.documentType === type);
                return (
                  <div key={type} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm capitalize">{type.replace(/_/g, " ")}</p>
                      <p className={`text-xs ${existing?.status === "verified" ? "text-emerald-600" : existing?.status === "rejected" ? "text-red-500" : "text-muted-foreground"}`}>
                        {existing
                          ? existing.status === "verified" ? "Verified"
                            : existing.status === "rejected" ? `Rejected${existing.rejectionReason ? `: ${existing.rejectionReason}` : ""}`
                            : existing.status.replace(/_/g, " ")
                          : "Not uploaded"}
                      </p>
                    </div>
                    {(!existing || ["rejected", "reupload_requested"].includes(existing.status)) && (
                      <input type="file" accept="image/*,application/pdf" disabled={docBusy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocument(type, f); }}
                        className="text-xs" />
                    )}
                  </div>
                );
              })}
              {docs.missingDocuments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Upload every required document to enable submission. Missing: {docs.missingDocuments.map((t) => t.replace(/_/g, " ")).join(", ")}.
                </p>
              )}
            </div>
          </div>
        )}

        {canEdit ? (
          <button onClick={save} disabled={saving || !form.companyName}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Only owners and managers can edit the business profile.</p>
        )}
      </div>

      {/* ── Payout destination (finance) ── */}
      <div className="mt-8 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" /> Payout destination
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Where settlement withdrawals are sent. Currently: <span className="font-medium text-foreground">{payoutMasked || "not configured"}</span>
        </p>
        {canEdit ? (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="payout-method" className="text-sm font-medium">Method</label>
              <select id="payout-method" value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })}
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize">
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank transfer</option>
              </select>
            </div>
            {payout.method === "mpesa" ? (
              <Field label="M-Pesa number" value={payout.mpesaNumber} onChange={(v) => setPayout({ ...payout, mpesaNumber: v })} placeholder="2547XXXXXXXX" />
            ) : (
              <>
                <Field label="Bank name" value={payout.bankName} onChange={(v) => setPayout({ ...payout, bankName: v })} />
                <Field label="Account number" value={payout.bankAccount} onChange={(v) => setPayout({ ...payout, bankAccount: v })} />
              </>
            )}
            <Field label="Account name" value={payout.accountName} onChange={(v) => setPayout({ ...payout, accountName: v })} />
            <div className="sm:col-span-2">
              <button onClick={savePayout} disabled={payoutSaving}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                {payoutSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save payout destination
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Only owners and managers can change the payout destination.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm disabled:opacity-60" />
    </div>
  );
}
