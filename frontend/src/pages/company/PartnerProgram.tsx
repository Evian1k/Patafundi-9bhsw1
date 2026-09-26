/**
 * Partner With FundiHub — public company application experience (spec §7).
 * Submits to POST /api/company/applications. The frontend can NEVER approve
 * a company — approval happens in the staff/admin review queue.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, CheckCircle2, ChevronRight, FileCheck2, Loader2,
  MapPin, ShieldCheck, Users, Wrench,
} from "lucide-react";
import { apiClient } from "@/lib/api";

const CATEGORIES = ["plumbing", "electrical", "hvac", "appliance_repair", "carpentry", "cleaning", "painting", "welding"];
const STEPS = ["Business", "Services", "Team", "Review"];

export default function PartnerProgram() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    companyName: "", legalName: "", registrationNumber: "",
    contactName: "", contactEmail: "", contactPhone: "",
    businessCategories: [] as string[], serviceAreas: "",
    branches: "", technicianCount: "", licenseDetails: "", description: "",
  });

  const set = (k: string, v: string | string[]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleCategory = (c: string) =>
    set("businessCategories", form.businessCategories.includes(c)
      ? form.businessCategories.filter((x) => x !== c)
      : [...form.businessCategories, c]);

  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        sessionStorage.setItem("pf_partner_draft", JSON.stringify(form));
        navigate("/auth?mode=login&next=/partner-program");
        return;
      }
      await apiClient.request("/company/applications", {
        method: "POST",
        body: {
          companyName: form.companyName,
          legalName: form.legalName || undefined,
          registrationNumber: form.registrationNumber || undefined,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          businessCategories: form.businessCategories,
          serviceAreas: form.serviceAreas.split(",").map((s) => s.trim()).filter(Boolean),
          branches: form.branches.split("\n").map((s) => s.trim()).filter(Boolean).map((b) => ({ name: b })),
          technicianCount: Number(form.technicianCount || 0),
          licenseDetails: form.licenseDetails || undefined,
          description: form.description || undefined,
        },
      });
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center rounded-3xl border bg-card p-8 shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Application received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Our partnerships team reviews every application. You will be notified by email
            and in-app when the review status changes. You can track it any time.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/dashboard" className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90">
              Go to dashboard
            </Link>
            <Link to="/" className="w-full rounded-xl border py-2.5 text-sm font-medium hover:bg-muted">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canNext =
    (step === 0 && form.companyName && form.contactName && form.contactEmail && form.contactPhone) ||
    (step === 1 && form.businessCategories.length > 0 && form.serviceAreas) ||
    step === 2 || step === 3;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">FundiHub <span className="text-emerald-500">Partners</span></Link>
          <Link to="/companies" className="text-sm text-muted-foreground hover:text-foreground">Company directory</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10">
          <aside className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-primary/100/5 px-3 py-1 text-xs font-medium text-primary">
                <Building2 className="h-3.5 w-3.5" /> Company Partner Program
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance">
                Grow your service business with FundiHub
              </h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Join Kenya's verified services marketplace as a professional company.
                Receive jobs from customers, dispatch your technicians,
                and get paid through transparent settlements.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                { icon: ShieldCheck, t: "Verified Partner badge", d: "Earn customer trust with platform verification." },
                { icon: Wrench, t: "Dispatch tools", d: "Assign technicians, track jobs, manage workload." },
                { icon: MapPin, t: "Service areas & branches", d: "Tell customers exactly where you operate." },
                { icon: Users, t: "Team management", d: "Roles for dispatchers, finance and technicians." },
              ].map(({ icon: Icon, t, d }) => (
                <li key={t} className="flex gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div><p className="font-medium">{t}</p><p className="text-muted-foreground text-xs mt-0.5">{d}</p></div>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border bg-card p-4 text-xs text-muted-foreground flex gap-2">
              <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
              Lifecycle: submitted → under review → approved. FundiHub staff verify
              your business before you go live — never automatic.
            </div>
          </aside>

          <section className="rounded-3xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 px-6 pt-6 flex-wrap">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                      i === step ? "bg-primary text-primary-foreground border-emerald-600"
                      : i < step ? "bg-primary/10 text-primary border-emerald-500/30"
                      : "text-muted-foreground"}`}
                  >
                    {i + 1}. {s}
                  </button>
                  {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {step === 0 && (
                <>
                  <Field label="Company / business name *" value={form.companyName} onChange={(v) => set("companyName", v)} placeholder="Apex Home Services Ltd" />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Legal name" value={form.legalName} onChange={(v) => set("legalName", v)} placeholder="Registered legal entity" />
                    <Field label="Registration number" value={form.registrationNumber} onChange={(v) => set("registrationNumber", v)} placeholder="PVT-XYZ890" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Contact person *" value={form.contactName} onChange={(v) => set("contactName", v)} placeholder="Full name" />
                    <Field label="Contact email *" type="email" value={form.contactEmail} onChange={(v) => set("contactEmail", v)} placeholder="ops@company.com" />
                  </div>
                  <Field label="Contact phone *" value={form.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="2547XXXXXXXX" />
                </>
              )}

              {step === 1 && (
                <>
                  <div>
                    <p className="text-sm font-medium mb-2">Service categories *</p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((c) => (
                        <button key={c} type="button" onClick={() => toggleCategory(c)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors ${
                            form.businessCategories.includes(c)
                              ? "bg-primary text-primary-foreground border-emerald-600"
                              : "hover:bg-muted"}`}>
                          {c.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="Service areas (comma separated) *" value={form.serviceAreas} onChange={(v) => set("serviceAreas", v)} placeholder="Nairobi, Kiambu, Westlands" />
                  <div>
                    <label className="text-sm font-medium">Branches (one per line)</label>
                    <textarea rows={3} value={form.branches} onChange={(e) => set("branches", e.target.value)}
                      className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      placeholder={"HQ — Westlands\nKaren Branch"} />
                  </div>
                  <Field label="License / certification details" value={form.licenseDetails} onChange={(v) => set("licenseDetails", v)} placeholder="EPRA, NEMA licenses…" />
                </>
              )}

              {step === 2 && (
                <>
                  <Field label="Number of technicians" type="number" value={form.technicianCount} onChange={(v) => set("technicianCount", v)} placeholder="12" />
                  <div>
                    <label className="text-sm font-medium">About your company</label>
                    <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)}
                      className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      placeholder="What makes your company a great partner? Years in operation, guarantees you offer…" />
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-3 text-sm">
                  <Row k="Company" v={form.companyName} />
                  <Row k="Contact" v={`${form.contactName} · ${form.contactEmail}`} />
                  <Row k="Categories" v={form.businessCategories.join(", ")} />
                  <Row k="Service areas" v={form.serviceAreas} />
                  <Row k="Technicians" v={form.technicianCount || "—"} />
                  <p className="text-xs text-muted-foreground pt-2">
                    By submitting you confirm the information is accurate. Applications move
                    through review by FundiHub staff; you will be notified of the decision.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

              <div className="flex justify-between pt-2">
                <button type="button" disabled={step === 0} onClick={() => setStep((s) => s - 1)}
                  className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40">Back</button>
                {step < 3 ? (
                  <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white inline-flex items-center gap-1 disabled:opacity-40 hover:bg-primary/90">
                    Continue <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" disabled={submitting} onClick={submit}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-40 hover:bg-primary/90">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Submit application
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v || "—"}</span>
    </div>
  );
}
