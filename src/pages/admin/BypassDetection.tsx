/**
 * Anti-Bypass Detection UI — Admin page for monitoring off-platform payment attempts.
 * Shows flagged jobs, trust score impacts, enforcement actions, and suspicious patterns.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, Search, RefreshCw, AlertTriangle, Eye,
  Ban, Loader2, Clock, DollarSign, User, ChevronRight,
  X, Activity, Zap, AlertOctagon, CheckCircle, TrendingDown,
  MessageSquare, Phone, Repeat,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import TrustBadge from "@/components/ui/TrustBadge";

type BypassSeverity = "low" | "medium" | "high" | "critical";
type BypassStatus = "flagged" | "under_review" | "penalised" | "cleared" | "suspended";

interface BypassSignal {
  type: "phone_share" | "cash_mention" | "repeat_pair" | "completion_no_payment" | "suspicious_cancel" | "direct_payment_request";
  description: string;
  detectedAt: string;
}

interface BypassAlert {
  id: string;
  jobId: string;
  customerName: string;
  customerTrustScore?: number;
  fundiName: string;
  fundiTrustScore?: number;
  serviceType?: string;
  amount?: number;
  status: BypassStatus;
  severity: BypassSeverity;
  signals: BypassSignal[];
  hoursElapsed?: number;
  paymentReceived: boolean;
  createdAt: string;
  note?: string;
}

const SEVERITY_STYLES: Record<BypassSeverity, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_STYLES: Record<BypassStatus, string> = {
  flagged: "bg-yellow-100 text-yellow-700 border-yellow-200",
  under_review: "bg-blue-100 text-blue-700 border-blue-200",
  penalised: "bg-orange-100 text-orange-700 border-orange-200",
  cleared: "bg-green-100 text-green-700 border-green-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
};

const SIGNAL_ICONS: Record<string, React.ElementType> = {
  phone_share: Phone,
  cash_mention: DollarSign,
  repeat_pair: Repeat,
  completion_no_payment: AlertOctagon,
  suspicious_cancel: X,
  direct_payment_request: MessageSquare,
};

const SIGNAL_LABELS: Record<string, string> = {
  phone_share: "Phone number shared in chat",
  cash_mention: '"Cash" or "pay directly" mentioned',
  repeat_pair: "Repeated customer-fundi pair",
  completion_no_payment: "Job completed without platform payment",
  suspicious_cancel: "Suspicious cancellation pattern",
  direct_payment_request: "Direct payment request detected",
};

export default function BypassDetection() {
  const [alerts, setAlerts] = useState<BypassAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("flagged");
  const [selected, setSelected] = useState<BypassAlert | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actioning, setActioning] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getBypassAlerts(1, 50) as {
        alerts?: BypassAlert[];
      };
      setAlerts(res.alerts ?? []);
    } catch (e) {
      console.error("[BypassDetection]", e);
      toast.error("Failed to load bypass alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleAction = async (
    alertId: string,
    action: "penalise" | "suspend" | "clear" | "review",
  ) => {
    setActioning(true);
    try {
      await apiClient.request(`/admin/bypass-alerts/${alertId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: actionNote }),
        includeAuth: true,
      });
      toast.success(`Action applied: ${action}`);
      setActionNote("");
      setSelected(null);
      fetchAlerts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActioning(false);
    }
  };

  // Filter
  const filtered = alerts.filter((a) => {
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.customerName?.toLowerCase().includes(q) || a.fundiName?.toLowerCase().includes(q) || a.jobId?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalFlagged = alerts.filter((a) => a.status === "flagged").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const penalisedCount = alerts.filter((a) => a.status === "penalised").length;
  const totalAtRisk = alerts.filter((a) => !a.paymentReceived).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-red-500" />
              Anti-Bypass Detection
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Monitor and enforce against off-platform payment attempts
            </p>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 border border-red-300 rounded-xl text-xs font-semibold animate-pulse">
                <Zap className="w-3.5 h-3.5" />
                {criticalCount} critical
              </span>
            )}
            <Button onClick={fetchAlerts} disabled={loading} variant="outline" size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Flagged", value: totalFlagged, color: "text-yellow-700 bg-yellow-50 border-yellow-200", icon: AlertTriangle },
            { label: "Critical", value: criticalCount, color: "text-red-700 bg-red-50 border-red-200", icon: Zap },
            { label: "Penalised", value: penalisedCount, color: "text-orange-700 bg-orange-50 border-orange-200", icon: Ban },
            { label: "Unpaid Jobs", value: totalAtRisk, color: "text-purple-700 bg-purple-50 border-purple-200", icon: DollarSign },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium opacity-70">{label}</p>
                <Icon className="w-3.5 h-3.5 opacity-60" />
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Detection rules info */}
        <Card className="p-4 bg-slate-50 border-slate-200">
          <div className="flex items-start gap-3">
            <Activity className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Active Detection Rules</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(SIGNAL_LABELS).map(([key, label]) => {
                  const Icon = SIGNAL_ICONS[key] || AlertTriangle;
                  return (
                    <span key={key} className="flex items-center gap-1 text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-full text-slate-600">
                      <Icon className="w-3 h-3" />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, fundi, or job ID..."
              className="pl-9"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="flagged">Flagged</option>
            <option value="under_review">Under Review</option>
            <option value="penalised">Penalised</option>
            <option value="cleared">Cleared</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* Main layout */}
        <div className={`grid gap-6 ${selected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* List */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-gray-500">Scanning bypass signals...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-3" />
                <p className="font-semibold text-gray-700">No bypass alerts</p>
                <p className="text-sm text-gray-500 mt-1">
                  {statusFilter === "flagged" ? "No active bypass flags detected." : "Try adjusting your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((alert, i) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card
                      className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                        selected?.id === alert.id ? "ring-2 ring-primary border-primary" : ""
                      } ${alert.severity === "critical" ? "border-l-4 border-l-red-400" : ""}`}
                      onClick={() => {
                        setSelected(alert);
                        setActionNote("");
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${SEVERITY_STYLES[alert.severity]}`}>
                              {alert.severity.toUpperCase()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[alert.status]}`}>
                              {alert.status.replace("_", " ")}
                            </span>
                            {!alert.paymentReceived && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                                Unpaid
                              </span>
                            )}
                          </div>

                          <p className="font-semibold text-sm">
                            {alert.customerName} ↔ {alert.fundiName}
                          </p>
                          {alert.serviceType && (
                            <p className="text-xs text-gray-500 mt-0.5">{alert.serviceType}</p>
                          )}

                          {/* Signals pills */}
                          <div className="flex gap-1 flex-wrap mt-2">
                            {alert.signals.slice(0, 3).map((sig, si) => {
                              const Icon = SIGNAL_ICONS[sig.type] || AlertTriangle;
                              return (
                                <span
                                  key={si}
                                  className="flex items-center gap-1 text-[10px] bg-orange-50 text-orange-700 border border-orange-100 px-1.5 py-0.5 rounded"
                                >
                                  <Icon className="w-2.5 h-2.5" />
                                  {sig.type.replace(/_/g, " ")}
                                </span>
                              );
                            })}
                            {alert.signals.length > 3 && (
                              <span className="text-[10px] text-gray-400">
                                +{alert.signals.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {alert.amount != null && (
                            <p className="font-bold text-primary text-sm">
                              KES {alert.amount.toLocaleString()}
                            </p>
                          )}
                          {alert.hoursElapsed != null && (
                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 justify-end">
                              <Clock className="w-3 h-3" />
                              {alert.hoursElapsed}h ago
                            </div>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 mt-1 ml-auto" />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                {/* Overview */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-red-500" />
                      Bypass Alert
                    </h3>
                    <button
                      onClick={() => setSelected(null)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Customer</p>
                      <p className="font-semibold text-sm">{selected.customerName}</p>
                      {selected.customerTrustScore != null && (
                        <TrustBadge score={selected.customerTrustScore} size="sm" showScore className="mt-1" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Fundi</p>
                      <p className="font-semibold text-sm">{selected.fundiName}</p>
                      {selected.fundiTrustScore != null && (
                        <TrustBadge score={selected.fundiTrustScore} size="sm" showScore className="mt-1" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className={`text-center p-2 rounded-xl border text-xs font-semibold ${SEVERITY_STYLES[selected.severity]}`}>
                      {selected.severity.toUpperCase()}
                    </div>
                    <div className={`text-center p-2 rounded-xl border text-xs font-semibold ${STATUS_STYLES[selected.status]}`}>
                      {selected.status.replace("_", " ")}
                    </div>
                    <div className={`text-center p-2 rounded-xl border text-xs font-semibold ${selected.paymentReceived ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                      {selected.paymentReceived ? "Paid" : "Unpaid"}
                    </div>
                  </div>

                  {selected.amount != null && (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                      <span className="text-sm text-gray-600">Job Amount</span>
                      <span className="font-bold text-primary text-lg">KES {selected.amount.toLocaleString()}</span>
                    </div>
                  )}
                </Card>

                {/* Detected signals */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-orange-500" />
                    <h4 className="font-semibold text-sm">Detected Signals ({selected.signals.length})</h4>
                  </div>
                  <div className="space-y-3">
                    {selected.signals.map((sig, i) => {
                      const Icon = SIGNAL_ICONS[sig.type] || AlertTriangle;
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                          <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 text-orange-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-orange-800">
                              {SIGNAL_LABELS[sig.type] || sig.type.replace(/_/g, " ")}
                            </p>
                            <p className="text-xs text-orange-700 mt-0.5">{sig.description}</p>
                            <p className="text-[10px] text-orange-400 mt-1">
                              {new Date(sig.detectedAt).toLocaleString("en-KE")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Enforcement actions */}
                {selected.status !== "cleared" && selected.status !== "suspended" && (
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ShieldAlert className="w-4 h-4 text-gray-400" />
                      <h4 className="font-semibold text-sm">Enforcement Actions</h4>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Note (optional)</label>
                        <Input
                          value={actionNote}
                          onChange={(e) => setActionNote(e.target.value)}
                          placeholder="Document enforcement reason..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actioning}
                          onClick={() => handleAction(selected.id, "review")}
                          className="gap-1.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Eye className="w-3.5 h-3.5" /> Mark Reviewing
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actioning}
                          onClick={() => handleAction(selected.id, "penalise")}
                          className="gap-1.5 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                        >
                          <TrendingDown className="w-3.5 h-3.5" /> Apply Penalty
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actioning}
                          onClick={() => handleAction(selected.id, "clear")}
                          className="gap-1.5 text-xs text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Mark Cleared
                        </Button>
                        <Button
                          size="sm"
                          disabled={actioning}
                          onClick={() => handleAction(selected.id, "suspend")}
                          className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
                        >
                          {actioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          Suspend
                        </Button>
                      </div>

                      <p className="text-xs text-gray-400 text-center">
                        Penalty reduces trust score by 10–20 pts · Suspension blocks all platform access
                      </p>
                    </div>
                  </Card>
                )}

                {/* Already resolved */}
                {(selected.status === "cleared" || selected.status === "suspended") && (
                  <div className={`p-4 rounded-2xl border ${selected.status === "cleared" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-2">
                      {selected.status === "cleared"
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <Ban className="w-4 h-4 text-red-600" />
                      }
                      <p className={`text-sm font-semibold ${selected.status === "cleared" ? "text-green-800" : "text-red-800"}`}>
                        {selected.status === "cleared" ? "Alert cleared — no action taken" : "Account suspended"}
                      </p>
                    </div>
                    {selected.note && (
                      <p className="text-xs mt-1 opacity-70 pl-6">{selected.note}</p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AdminLayout>
  );
}
