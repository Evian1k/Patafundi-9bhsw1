/**
 * Emergency Controls — Super Admin only
 * One-click toggle for critical platform features
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { AlertTriangle, Shield, Power, Lock, Bell } from "lucide-react";
import { toast } from "sonner";

export default function EmergencyControls() {
  const [controls, setControls] = useState<Record<string, { label: string; active: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.request("/admin/emergency/status").catch(() => ({ controls: {} }))
      .then((d: any) => setControls(d?.controls || {}))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (control: string, currentActive: boolean) => {
    const action = currentActive ? "disable" : "enable";
    const reason = window.prompt(`Why are you ${action === "enable" ? "activating" : "deactivating"} ${control}?`, "");
    if (reason === null) return; // cancelled
    setActing(control);
    try {
      await apiClient.request("/admin/emergency/toggle", {
        method: "POST",
        body: JSON.stringify({ control, action, reason }),
      });
      toast.success(`${control} ${action === "enable" ? "activated" : "deactivated"}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to toggle");
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading emergency controls…</div>;

  const controlList = [
    { key: "maintenance_mode", icon: Power, desc: "Put platform in maintenance mode. Customers see maintenance page, staff have access." },
    { key: "disable_payments", icon: Lock, desc: "Stop all new payment processing. Existing escrow unaffected." },
    { key: "disable_registrations", icon: Shield, desc: "Block new customer registrations." },
    { key: "disable_fundi_signups", icon: Shield, desc: "Block new fundi registrations." },
    { key: "disable_chat", icon: Bell, desc: "Disable in-app chat between customers and fundis." },
    { key: "disable_ai", icon: AlertTriangle, desc: "Disable AI analysis and recommendations." },
    { key: "disable_referrals", icon: AlertTriangle, desc: "Disable referral code validation and voucher issuance." },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Emergency Controls</h1>
          <p className="text-slate-500 text-sm">One-click platform controls. All actions are audited and staff are notified.</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        ⚠️ <strong>Warning:</strong> These controls affect the entire platform. Use with caution.
        All actions are logged and all staff members are notified immediately.
      </div>

      <div className="grid gap-3">
        {controlList.map(({ key, icon: Icon, desc }) => {
          const control = controls[key];
          const isActive = control?.active ?? false;
          return (
            <div key={key} className={`bg-white rounded-2xl p-5 border-2 ${isActive ? "border-red-300 bg-red-50" : "border-slate-100"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-red-100" : "bg-slate-100"}`}>
                    <Icon className={`w-5 h-5 ${isActive ? "text-red-600" : "text-slate-500"}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{control?.label || key.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        ● ACTIVE
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggle(key, isActive)}
                  disabled={acting === key}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                    isActive
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-red-100 text-red-700 hover:bg-red-200"
                  } disabled:opacity-50`}
                >
                  {acting === key ? "..." : isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
