import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Wrench } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface CatalogItem {
  id: string; slug: string; title: string; canonicalTitle?: string; displayName?: string;
  description: string | null; icon: string; color: string | null; aliases: string[];
  sortOrder: number; isActive: boolean; countryCode: string | null; isAvailable: boolean;
  pricingMode: "automatic" | "quote_required";
  basePrice: number | null; minimumPrice: number | null; maximumPrice: number | null;
  estimatedDurationMinutes: number | null;
}
interface CatalogForm {
  slug: string; title: string; description: string; icon: string; color: string;
  aliases: string; sortOrder: string; countryCode: string; displayName: string;
  isActive: boolean; isAvailable: boolean; pricingMode: "automatic" | "quote_required"; basePrice: string; minimumPrice: string;
  maximumPrice: string; estimatedDurationMinutes: string;
}

const newForm = (countryCode: string): CatalogForm => ({
  slug: "", title: "", description: "", icon: "construct", color: "#1E9E8A",
  aliases: "", sortOrder: "500", countryCode, displayName: "", isActive: true,
  isAvailable: true, pricingMode: "quote_required", basePrice: "", minimumPrice: "", maximumPrice: "",
  estimatedDurationMinutes: "",
});

function toForm(item: CatalogItem, countryCode: string): CatalogForm {
  return {
    slug: item.slug, title: item.canonicalTitle || item.title, description: item.description || "",
    icon: item.icon || "construct", color: item.color || "#1E9E8A", aliases: (item.aliases || []).join(", "),
    sortOrder: String(item.sortOrder ?? 500), countryCode,
    displayName: item.displayName || item.title, isActive: item.isActive, isAvailable: item.isAvailable,
    pricingMode: item.pricingMode || "quote_required",
    basePrice: item.basePrice == null ? "" : String(item.basePrice), minimumPrice: item.minimumPrice == null ? "" : String(item.minimumPrice),
    maximumPrice: item.maximumPrice == null ? "" : String(item.maximumPrice), estimatedDurationMinutes: item.estimatedDurationMinutes == null ? "" : String(item.estimatedDurationMinutes),
  };
}

export default function ServiceCatalogManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const [countryCode, setCountryCode] = useState("KE");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<CatalogForm>(() => newForm("KE"));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.adminListServiceCategories(countryCode, search) as { services?: CatalogItem[] };
      setItems(response.services || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the service catalog.");
    } finally {
      setLoading(false);
    }
  }, [countryCode, search]);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(newForm(countryCode)); setDialogOpen(true); };
  const openEdit = (item: CatalogItem) => { setEditing(item); setForm(toForm(item, countryCode)); setDialogOpen(true); };
  const set = <K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) => setForm((old) => ({ ...old, [key]: value }));

  const save = async () => {
    if (!form.title.trim() || (!editing && !form.slug.trim())) {
      toast.error("Enter both the service name and a canonical slug.");
      return;
    }
    if (form.pricingMode === "automatic") {
      const minimum = Number(form.minimumPrice);
      const base = Number(form.basePrice);
      const maximum = Number(form.maximumPrice);
      if (![minimum, base, maximum].every((value) => Number.isFinite(value) && value > 0) || minimum > base || base > maximum) {
        toast.error("Automatic pricing requires real amounts satisfying 0 < minimum ≤ base ≤ maximum.");
        return;
      }
    }
    const payload = {
      slug: form.slug.trim().toLowerCase(), title: form.title.trim(), description: form.description.trim() || null,
      icon: form.icon.trim() || "construct", color: form.color.trim() || null,
      aliases: form.aliases.split(",").map((value) => value.trim()).filter(Boolean),
      sortOrder: Number(form.sortOrder), countryCode: form.countryCode.trim().toUpperCase(),
      displayName: form.displayName.trim() || form.title.trim(), isActive: form.isActive,
      isAvailable: form.isAvailable, pricingMode: form.pricingMode,
      basePrice: form.pricingMode === "automatic" ? Number(form.basePrice) : null,
      minimumPrice: form.pricingMode === "automatic" ? Number(form.minimumPrice) : null,
      maximumPrice: form.pricingMode === "automatic" ? Number(form.maximumPrice) : null,
      estimatedDurationMinutes: form.pricingMode === "automatic" ? Number(form.estimatedDurationMinutes) || 60 : null,
    };
    setSaving(true);
    try {
      if (editing) await apiClient.adminUpdateServiceCategory(editing.slug, payload);
      else await apiClient.adminCreateServiceCategory(payload);
      toast.success(editing ? "Service catalog entry updated." : "Service added to the catalog.");
      setDialogOpen(false);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the service.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (item: CatalogItem) => {
    if (!window.confirm(`Deactivate ${item.title}? Existing bookings are preserved; it will no longer appear for new requests.`)) return;
    try {
      await apiClient.adminDeactivateServiceCategory(item.slug);
      toast.success(`${item.title} is no longer offered for new requests.`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not deactivate the service.");
    }
  };

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Service catalog</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">One backend-owned catalog powers customer search, booking, provider skills, company services, and country availability. Changes are audited; deactivation does not remove historical bookings.</p>
          </div>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add service</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Catalog by country</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div className="w-28"><Label htmlFor="catalog-country">Country</Label><Input id="catalog-country" value={countryCode} maxLength={2} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} aria-label="Two-letter country code" /></div>
            <div className="min-w-[220px] flex-1"><Label htmlFor="catalog-search">Search</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="catalog-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, slug, description, or alias" /></div></div>
            <Button className="mt-5" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          </CardContent>
        </Card>

        {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p className="font-medium">Catalog load failed</p><p className="mt-1 text-muted-foreground">{error}</p><Button className="mt-3" variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>}
        {loading ? <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…</div> : null}
        {!loading && !error && items.length === 0 && <Card><CardContent className="py-12 text-center"><Wrench className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No matching services</p><p className="mt-1 text-sm text-muted-foreground">Try a different search or add a service.</p></CardContent></Card>}
        {!loading && !error && items.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => (
          <Card key={item.slug} className={!item.isActive ? "opacity-70" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{item.slug} · {item.icon}</p></div><div className="flex gap-1"><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.isActive ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "Active" : "Inactive"}</span><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.isAvailable ? "bg-sky-100 text-sky-800" : "bg-muted text-muted-foreground"}`}>{item.isAvailable ? `Available · ${countryCode}` : `Unavailable · ${countryCode}`}</span></div></div>
              {item.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
              <p className="mt-3 text-xs text-muted-foreground">{item.pricingMode === "quote_required" ? "Provider quote required" : `${item.minimumPrice?.toLocaleString() ?? "—"}–${item.maximumPrice?.toLocaleString() ?? "—"} ${countryCode === "KE" ? "KES" : "local currency"} · ${item.estimatedDurationMinutes ?? "—"} min`}</p>
              {item.aliases?.length > 0 && <p className="mt-2 truncate text-xs text-muted-foreground">Search aliases: {item.aliases.join(", ")}</p>}
              <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>{item.isActive && item.slug !== "other" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deactivate(item)}>Deactivate</Button>}</div>
            </CardContent>
          </Card>
        ))}</div>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit service" : "Add a service"}</DialogTitle><DialogDescription>Changes apply to new catalog searches. Existing bookings and historical records are not rewritten.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="service-title">Display name</Label><Input id="service-title" value={form.title} onChange={(event) => set("title", event.target.value)} /></div>
            <div><Label htmlFor="service-slug">Canonical slug</Label><Input id="service-slug" disabled={Boolean(editing)} placeholder="e.g. appliance-repair" value={form.slug} onChange={(event) => set("slug", event.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="service-description">Description</Label><Textarea id="service-description" value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} /></div>
            <div><Label htmlFor="service-aliases">Search aliases (comma-separated)</Label><Input id="service-aliases" value={form.aliases} onChange={(event) => set("aliases", event.target.value)} placeholder="aircon, air conditioning" /></div>
            <div><Label htmlFor="service-icon">Icon key</Label><Input id="service-icon" value={form.icon} onChange={(event) => set("icon", event.target.value)} /></div>
            <div><Label htmlFor="service-color">Brand color</Label><Input id="service-color" value={form.color} onChange={(event) => set("color", event.target.value)} placeholder="#1E9E8A" /></div>
            <div><Label htmlFor="service-order">Display order</Label><Input id="service-order" type="number" min="0" value={form.sortOrder} onChange={(event) => set("sortOrder", event.target.value)} /></div>
            <div><Label htmlFor="service-country">Country code</Label><Input id="service-country" value={form.countryCode} maxLength={2} onChange={(event) => set("countryCode", event.target.value.toUpperCase())} /></div>
            <div><Label htmlFor="service-local-name">Country display name</Label><Input id="service-local-name" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} /></div>
            <div><Label htmlFor="service-pricing-mode">Pricing mode</Label><select id="service-pricing-mode" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.pricingMode} onChange={(event) => set("pricingMode", event.target.value as CatalogForm["pricingMode"])}><option value="quote_required">Provider quote required</option><option value="automatic">Automatic platform pricing</option></select></div>
            <div><Label htmlFor="service-min">Minimum amount (country currency)</Label><Input id="service-min" type="number" min="0.01" disabled={form.pricingMode !== "automatic"} value={form.minimumPrice} onChange={(event) => set("minimumPrice", event.target.value)} /></div>
            <div><Label htmlFor="service-base">Base amount (country currency)</Label><Input id="service-base" type="number" min="0.01" disabled={form.pricingMode !== "automatic"} value={form.basePrice} onChange={(event) => set("basePrice", event.target.value)} /></div>
            <div><Label htmlFor="service-max">Maximum amount (country currency)</Label><Input id="service-max" type="number" min="0.01" disabled={form.pricingMode !== "automatic"} value={form.maximumPrice} onChange={(event) => set("maximumPrice", event.target.value)} /></div>
            <div><Label htmlFor="service-duration">Estimated duration (minutes)</Label><Input id="service-duration" type="number" min="15" max="1440" disabled={form.pricingMode !== "automatic"} value={form.estimatedDurationMinutes} onChange={(event) => set("estimatedDurationMinutes", event.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} /> Active globally</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isAvailable} onChange={(event) => set("isAvailable", event.target.checked)} /> Available in this country</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save service"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
  return embedded ? content : <AdminLayout>{content}</AdminLayout>;
}
