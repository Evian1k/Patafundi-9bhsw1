import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Save, Loader2, Bell, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface AdminSettings {
  platformCommissionRate: number;
  minimumJobPrice: number;
  maximumJobPrice: number;
  maintenanceMode: boolean;
  newRegistrationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>({
    platformCommissionRate: 10,
    minimumJobPrice: 100,
    maximumJobPrice: 50000,
    maintenanceMode: false,
    newRegistrationsEnabled: true,
    emailNotificationsEnabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.request("/admin/settings", { includeAuth: true }) as { settings?: AdminSettings };
      if (response.settings) setSettings(response.settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.request("/admin/settings", { method: "PUT", includeAuth: true, body: settings });
      toast.success("Settings saved successfully");
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof AdminSettings, value: unknown) => setSettings((s) => ({ ...s, [key]: value }));

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors relative ${value ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground text-sm">Configure platform settings and preferences</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Loading settings...
          </div>
        ) : (
          <>
            {/* Financial Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold">Financial Settings</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Platform Commission Rate (%)</label>
                  <Input type="number" value={settings.platformCommissionRate} onChange={(e) => update("platformCommissionRate", parseFloat(e.target.value))} min={0} max={100} />
                  <p className="text-xs text-muted-foreground mt-1">Commission taken from each job payment</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum Job Price (KES)</label>
                  <Input type="number" value={settings.minimumJobPrice} onChange={(e) => update("minimumJobPrice", parseInt(e.target.value))} />
                  <p className="text-xs text-muted-foreground mt-1">Minimum price allowed for jobs</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Maximum Job Price (KES)</label>
                  <Input type="number" value={settings.maximumJobPrice} onChange={(e) => update("maximumJobPrice", parseInt(e.target.value))} />
                  <p className="text-xs text-muted-foreground mt-1">Maximum price allowed for jobs</p>
                </div>
              </div>
            </Card>

            {/* Platform Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="font-semibold">Platform Settings</h2>
              </div>
              <div className="space-y-4">
                {[
                  { key: "maintenanceMode" as const, label: "Maintenance Mode", desc: "Disable platform access for users during maintenance" },
                  { key: "newRegistrationsEnabled" as const, label: "Allow New Registrations", desc: "Allow customers and fundis to register new accounts" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Toggle value={settings[key] as boolean} onChange={(v) => update(key, v)} />
                  </div>
                ))}
              </div>
            </Card>

            {/* Notifications */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-yellow-50 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-yellow-600" />
                </div>
                <h2 className="font-semibold">Notifications</h2>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                <div>
                  <p className="font-medium text-sm">Email Notifications</p>
                  <p className="text-xs text-muted-foreground">Send email notifications for important events</p>
                </div>
                <Toggle value={settings.emailNotificationsEnabled} onChange={(v) => update("emailNotificationsEnabled", v)} />
              </div>
            </Card>

            {/* Save */}
            <div className="flex gap-3">
              <Button onClick={handleSaveSettings} disabled={saving} className="bg-gradient-primary">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Settings</>}
              </Button>
              <Button variant="outline" onClick={fetchSettings} disabled={saving || loading}>Reset</Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
