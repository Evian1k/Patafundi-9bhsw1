/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Commission Control Center — super_admin only.
 * Set global + per-category commission rates, simulate revenue, view change history.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calculator, History, Save } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { SERVICE_CATALOG } from "@/config/services";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Real bookable categories from the shared service catalog - never a hand-
// typed list that drifts from what jobs can actually be created with.
const CATEGORIES = SERVICE_CATALOG.map((s) => s.id);

export default function CommissionControl() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  // Simulator state
  const [simAmount, setSimAmount] = useState("10000");
  const [simCategory, setSimCategory] = useState("plumbing");
  const [simRate, setSimRate] = useState("15");
  const [simResult, setSimResult] = useState<any>(null);

  // Rate update state
  const [updateScope, setUpdateScope] = useState("global");
  const [updateCategory, setUpdateCategory] = useState("plumbing");
  const [updateRate, setUpdateRate] = useState("15");
  const [updateReason, setUpdateReason] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.request("/admin/commission/history", { includeAuth: true }) as { history: any[] };
      setHistory(data.history || []);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") { navigate("/staff"); return; }
      } catch { navigate("/staff/login"); return; }
      fetchHistory();
    })();
  }, [navigate, fetchHistory]);

  const runSimulation = async () => {
    try {
      const data = await apiClient.request("/admin/commission/simulate", {
        method: "POST",
        body: JSON.stringify({
          jobAmount: Number(simAmount),
          category: simCategory,
          commissionRate: Number(simRate) / 100,
        }),
        includeAuth: true,
      }) as any;
      setSimResult(data.simulation);
    } catch {
      toast.error("Simulation failed");
    }
  };

  const saveRate = async () => {
    try {
      await apiClient.request("/admin/commission/rate", {
        method: "PUT",
        body: JSON.stringify({
          scope: updateScope,
          scopeValue: updateScope === "category" ? updateCategory : null,
          newRate: Number(updateRate) / 100,
          reason: updateReason || undefined,
        }),
        includeAuth: true,
      });
      toast.success("Commission rate updated");
      fetchHistory();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Commission Control Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Set commission rates, simulate revenue, and audit changes</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Simulator */}
          <motion.div variants={fadeUp} className="bg-card rounded-2xl p-6 shadow-sm border border-border/60">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Revenue Simulator</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Job Amount (KSh)</label>
                <input type="number" value={simAmount} onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select value={simCategory} onChange={(e) => setSimCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Commission Rate (%)</label>
                <input type="number" value={simRate} onChange={(e) => setSimRate(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
              </div>
              <Button className="w-full" onClick={runSimulation}>
                <Calculator className="w-4 h-4 mr-2" /> Simulate
              </Button>
              {simResult && (
                <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Job Amount</div>
                      <div className="font-bold text-foreground">{formatMoney(simResult.jobAmount)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Commission Rate</div>
                      <div className="font-bold text-foreground">{simResult.commissionPercent}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Platform Earnings</div>
                      <div className="font-bold text-emerald-600">{formatMoney(simResult.platformEarnings)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Fundi Earnings</div>
                      <div className="font-bold text-blue-600">{formatMoney(simResult.fundiEarnings)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Update Rate */}
          <motion.div variants={fadeUp} className="bg-card rounded-2xl p-6 shadow-sm border border-border/60">
            <div className="flex items-center gap-2 mb-4">
              <Save className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Update Commission Rate</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Scope</label>
                <select value={updateScope} onChange={(e) => setUpdateScope(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1">
                  <option value="global">Global (all categories)</option>
                  <option value="category">Per Category</option>
                </select>
              </div>
              {updateScope === "category" && (
                <div>
                  <label className="text-xs text-muted-foreground">Category</label>
                  <select value={updateCategory} onChange={(e) => setUpdateCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">New Rate (%)</label>
                <input type="number" value={updateRate} onChange={(e) => setUpdateRate(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason (optional)</label>
                <input type="text" value={updateReason} onChange={(e) => setUpdateReason(e.target.value)}
                  placeholder="e.g. Promotional discount for cleaning"
                  className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
              </div>
              <Button className="w-full" onClick={saveRate}>
                <Save className="w-4 h-4 mr-2" /> Save & Audit
              </Button>
              <p className="text-xs text-amber-600">⚠️ Changes are audit-logged and cannot be deleted.</p>
            </div>
          </motion.div>
        </div>

        {/* Change History */}
        <motion.div variants={fadeUp} className="mt-6 bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Change History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/60">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Scope</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Old Rate</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">New Rate</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Changed By</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : historyError ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-amber-600">Change history could not be loaded. <button onClick={fetchHistory} className="underline">Retry</button></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No changes yet</td></tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="border-b border-border/40">
                      <td className="px-4 py-2 capitalize">{h.scope}{h.scope_value ? ` (${h.scope_value})` : ""}</td>
                      <td className="px-4 py-2">{h.old_rate ? (Number(h.old_rate) * 100).toFixed(1) + "%" : "Initial rate"}</td>
                      <td className="px-4 py-2 font-medium text-primary">{(Number(h.new_rate) * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2 text-muted-foreground">{h.reason || "Not recorded"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{h.changed_by_name || "System"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
