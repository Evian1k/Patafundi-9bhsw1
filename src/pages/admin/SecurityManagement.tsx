/**
 * Security & Fraud Control — upgraded with bypass detection feed and trust overview.
 * The dedicated full pages are /admin/bypass-detection and /admin/trust-scores.
 * This page is the security overview hub linking to those pages.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Shield, Loader2, Eye, Ban, CheckCircle,
  LogOut, AlertOctagon, TrendingDown, ShieldAlert, Award,
  ArrowRight, Activity, Lock, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import TrustBadge from "@/components/ui/TrustBadge";

interface SecurityAlert {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  targetUserId: string;
  targetUserName: string;
  createdAt: string;
  resolved: boolean;
}

interface TrustSummary {
  elite: number;
  trusted: number;
  risky: number;
  critical: number;
  totalUsers: number;
  avgScore: number;
}

export default function SecurityManagement() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [trustSummary, setTrustSummary] = useState<TrustSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResolved, setFilterResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"alerts" | "trust" | "bypass">("alerts");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [alertRes, trustRes] = await Promise.allSettled([
        apiClient.request("/admin/security-alerts", { includeAuth: true }) as Promise<{ alerts?: SecurityAlert[] }>,
        apiClient.request("/admin/trust-summary", { includeAuth: true }) as Promise<TrustSummary>,
      ]);
      if (alertRes.status === "fulfilled") setAlerts(alertRes.value?.alerts ?? []);
      if (trustRes.status === "fulfilled") setTrustSummary(trustRes.value ?? null);
    } catch (e) {
      console.error("[Security]", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleResolveAlert = async (alertId: string) => {
    setResolving(alertId);
    try {
      await apiClient.request(`/admin/security-alerts/${alertId}/resolve`, { method: "POST", includeAuth: true });
      toast.success("Alert resolved");
      fetchData();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to resolve"); }
    finally { setResolving(null); }
  };

  const handleForceLogout = async (userId: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/force-logout`, { method: "POST", includeAuth: true });
      toast.success("User logged out");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleDisableAccount = async (userId: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/disable`, { method: "POST", includeAuth: true });
      toast.success("Account disabled");
      fetchData();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const getSeverityColor = (s: string) => ({
    high: "bg-red-100 text-red-800 border-red-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    low: "bg-blue-100 text-blue-800 border-blue-200",
  }[s] ?? "bg-gray-100 text-gray-800 border-gray-200");

  const getSeverityIcon = (s: string) => {
    if (s === "high") return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (s === "medium") return <AlertOctagon className="w-4 h-4 text-yellow-500" />;
    return <Eye className="w-4 h-4 text-blue-500" />;
  };

  const filtered = alerts.filter((a) =>
    (filterResolved ? !a.resolved : true) &&
    (searchQuery
      ? a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.targetUserName.toLowerCase().includes(searchQuery.toLowerCase())
      : true)
  );

  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security & Fraud Control</h1>
            <p className="text-gray-500 text-sm">Monitor alerts, bypass attempts, and trust scores</p>
          </div>
          <div className="flex gap-2">
            {unresolvedCount > 0 && (
              <span className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-800 rounded-xl text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {unresolvedCount} unresolved
              </span>
            )}
            <Button onClick={fetchData} disabled={loading} variant="outline" size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Quick navigation cards */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/admin/bypass-detection")}
            className="p-4 bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-2xl text-left hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <ShieldAlert className="w-6 h-6 text-red-500" />
              <ArrowRight className="w-4 h-4 text-red-400" />
            </div>
            <p className="font-bold text-red-800">Bypass Detection</p>
            <p className="text-xs text-red-600 mt-1">Off-platform payment flags, enforcement actions</p>
          </button>

          <button
            onClick={() => navigate("/admin/trust-scores")}
            className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl text-left hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <Award className="w-6 h-6 text-amber-500" />
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </div>
            <p className="font-bold text-amber-800">Trust Scores</p>
            <p className="text-xs text-amber-600 mt-1">View and adjust all user trust ratings</p>
          </button>
        </div>

        {/* Trust summary strip */}
        {trustSummary && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Elite", value: trustSummary.elite, color: "text-amber-600 bg-amber-50 border-amber-200" },
              { label: "Trusted", value: trustSummary.trusted, color: "text-green-600 bg-green-50 border-green-200" },
              { label: "Risky", value: trustSummary.risky, color: "text-red-600 bg-red-50 border-red-200" },
              { label: "Avg Score", value: Math.round(trustSummary.avgScore), color: "text-blue-600 bg-blue-50 border-blue-200" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs font-medium mt-0.5 opacity-70">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(["alerts", "bypass", "trust"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-gray-500"
              }`}
            >
              {tab === "alerts"
                ? `Security Alerts${unresolvedCount > 0 ? ` (${unresolvedCount})` : ""}`
                : tab === "bypass"
                ? "Bypass Overview"
                : "Trust Overview"}
            </button>
          ))}
        </div>

        {activeTab === "alerts" && (
          <>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search alerts..." />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={filterResolved} onChange={(e) => setFilterResolved(e.target.checked)} className="w-4 h-4" />
                <span>Show only unresolved</span>
              </label>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-gray-500">Loading security alerts...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">All Clear</p>
                <p className="text-gray-500 text-sm">No security alerts at the moment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((alert) => (
                  <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className={`p-4 ${alert.resolved ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getSeverityColor(alert.severity)}`}>
                              {alert.severity.toUpperCase()}
                            </span>
                            {alert.resolved && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">Resolved</span>
                            )}
                            <p className="font-semibold text-sm">{alert.title}</p>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            User: {alert.targetUserName} · {new Date(alert.createdAt).toLocaleString("en-KE")}
                          </p>
                        </div>
                        {!alert.resolved && (
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => handleForceLogout(alert.targetUserId)} className="text-blue-600 text-xs">
                              <LogOut className="w-3 h-3 mr-1" />Logout
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDisableAccount(alert.targetUserId)} className="text-red-600 text-xs">
                              <Ban className="w-3 h-3 mr-1" />Disable
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleResolveAlert(alert.id)} disabled={resolving === alert.id} className="text-green-600 text-xs">
                              {resolving === alert.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                              Resolve
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "bypass" && (
          <div className="space-y-4">
            <Card className="p-5 bg-orange-50 border-orange-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-600" />
                  <h3 className="font-bold text-orange-900">Bypass Detection Engine</h3>
                </div>
                <Button
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                  onClick={() => navigate("/admin/bypass-detection")}
                >
                  Open Full Panel <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="space-y-2 text-sm text-orange-800">
                {[
                  "Phone number sharing detection in chat",
                  '"Pay directly" / "cash" keyword monitoring',
                  "Jobs completed without platform payment (>24h)",
                  "Suspicious cancellation patterns",
                  "Repeated customer-fundi pair tracking",
                  "Automated trust score penalties on detection",
                ].map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    {rule}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === "trust" && (
          <div className="space-y-4">
            <Card className="p-5 bg-amber-50 border-amber-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-amber-900">Trust Score System</h3>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  onClick={() => navigate("/admin/trust-scores")}
                >
                  Manage Scores <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Elite (90+)", badge: <TrustBadge score={95} size="sm" />, desc: "Top-rated, fully trusted users" },
                  { label: "Trusted (70+)", badge: <TrustBadge score={75} size="sm" />, desc: "Reliable, verified track record" },
                  { label: "Verified (50+)", badge: <TrustBadge score={55} size="sm" />, desc: "Standard platform users" },
                  { label: "Risky (<50)", badge: <TrustBadge score={30} size="sm" />, desc: "Flagged or restricted access" },
                ].map(({ label, badge, desc }) => (
                  <div key={label} className="bg-white rounded-xl p-3 border border-amber-100">
                    <div className="mb-2">{badge}</div>
                    <p className="text-xs font-semibold text-gray-700">{label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
              <div className="text-xs text-amber-700 space-y-1">
                <p>• Scores range from 0–100 and update automatically based on behavior</p>
                <p>• Bypass attempts: −10 to −20 pts · Successful payments: +5 pts</p>
                <p>• Risky users see reduced visibility and stricter verification</p>
                <p>• Admins can manually adjust scores with documented notes</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
