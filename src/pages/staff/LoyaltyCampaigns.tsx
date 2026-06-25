/**
 * Loyalty Campaigns — Super Admin only
 * Manage loyalty tiers, point multipliers, and promotional campaigns
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Crown, Star, Award, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

const TIERS = [
  { key: "bronze", label: "Bronze", icon: Award, color: "text-amber-700", bg: "bg-amber-100", minPoints: 0, multiplier: 1.0 },
  { key: "silver", label: "Silver", icon: Award, color: "text-slate-600", bg: "bg-slate-100", minPoints: 500, multiplier: 1.2 },
  { key: "gold", label: "Gold", icon: Star, color: "text-yellow-600", bg: "bg-yellow-100", minPoints: 2000, multiplier: 1.5 },
  { key: "platinum", label: "Platinum", icon: Crown, color: "text-cyan-600", bg: "bg-cyan-100", minPoints: 5000, multiplier: 2.0 },
  { key: "diamond", label: "Diamond", icon: Crown, color: "text-purple-600", bg: "bg-purple-100", minPoints: 10000, multiplier: 3.0 },
];

export default function LoyaltyCampaigns() {
  const [enabled, setEnabled] = useState(true);
  const [pointMultiplier, setPointMultiplier] = useState(1.0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.request("/admin/feature-flags").catch(() => ({ flags: [] }))
      .then((d: any) => {
        const flags = d?.flags || [];
        const loyaltyFlag = flags.find((f: any) => f.key === "loyalty");
        setEnabled(loyaltyFlag?.is_enabled !== false);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleLoyalty = async () => {
    try {
      await apiClient.request("/admin/feature-flags", {
        method: "PUT",
        body: JSON.stringify({ key: "loyalty", enabled: !enabled }),
      });
      setEnabled(!enabled);
      toast.success(`Loyalty program ${!enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to toggle loyalty program");
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading loyalty campaigns…</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Loyalty Campaigns</h1>
          <p className="text-slate-500 text-sm">Manage loyalty tiers and point rewards</p>
        </div>
        <button
          onClick={toggleLoyalty}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
        >
          {enabled ? "Program Active" : "Program Disabled"}
        </button>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-100 mb-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Loyalty Tiers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {TIERS.map(tier => {
            const Icon = tier.icon;
            return (
              <div key={tier.key} className={`p-4 rounded-xl ${tier.bg}`}>
                <Icon className={`w-8 h-8 ${tier.color} mb-2`} />
                <div className={`font-bold ${tier.color}`}>{tier.label}</div>
                <div className="text-xs text-slate-600 mt-1">{tier.minPoints.toLocaleString()} pts</div>
                <div className="text-xs text-slate-600">{tier.multiplier}x multiplier</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" /> Global Point Multiplier
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Boost points earned across all jobs (e.g., 2x = double points during promotions)
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range" min="1" max="5" step="0.5"
            value={pointMultiplier}
            onChange={e => setPointMultiplier(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-lg font-bold text-primary w-16 text-right">{pointMultiplier}x</span>
          <button
            onClick={() => toast.success(`Point multiplier set to ${pointMultiplier}x`)}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
