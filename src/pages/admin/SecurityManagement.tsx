import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Shield, Loader2, Lock, Eye, Ban, CheckCircle, LogOut, X, AlertOctagon, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

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

interface TrustScore {
  userId: string;
  userName: string;
  role: string;
  score: number;
  flags: string[];
  bypassAttempts: number;
  lastActivity: string;
}

export default function SecurityManagement() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [trustScores, setTrustScores] = useState<TrustScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResolved, setFilterResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'trust'>('alerts');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.request('/admin/security-alerts', { includeAuth: true }) as { alerts?: SecurityAlert[] };
      setAlerts(response.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Failed to load security alerts');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrustScores = async () => {
    try {
      const response = await apiClient.getTrustScores() as { scores?: TrustScore[] };
      setTrustScores(response.scores || []);
    } catch { /* endpoint may not exist yet */ }
  };

  useEffect(() => {
    fetchAlerts();
    fetchTrustScores();
  }, []);

  const handleResolveAlert = async (alertId: string) => {
    setResolving(alertId);
    try {
      await apiClient.request(`/admin/security-alerts/${alertId}/resolve`, { method: 'POST', includeAuth: true });
      toast.success('Alert resolved');
      fetchAlerts();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed to resolve alert');
    } finally {
      setResolving(null);
    }
  };

  const handleForceLogout = async (userId: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/force-logout`, { method: 'POST', includeAuth: true });
      toast.success('User logged out');
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed');
    }
  };

  const handleDisableAccount = async (userId: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/disable`, { method: 'POST', includeAuth: true });
      toast.success('Account disabled');
      fetchAlerts();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed');
    }
  };

  const getSeverityColor = (severity: string) => {
    return { high: 'bg-red-100 text-red-800 border-red-200', medium: 'bg-yellow-100 text-yellow-800 border-yellow-200', low: 'bg-blue-100 text-blue-800 border-blue-200' }[severity] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'high') return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (severity === 'medium') return <AlertOctagon className="w-4 h-4 text-yellow-500" />;
    return <Eye className="w-4 h-4 text-blue-500" />;
  };

  const filteredAlerts = alerts.filter((alert) =>
    (filterResolved ? !alert.resolved : true) &&
    (searchQuery ? alert.title.toLowerCase().includes(searchQuery.toLowerCase()) || alert.targetUserName.toLowerCase().includes(searchQuery.toLowerCase()) : true)
  );

  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security & Fraud Control</h1>
            <p className="text-gray-500 text-sm">Monitor bypass attempts, fraud, and trust scores</p>
          </div>
          {unresolvedCount > 0 && (
            <span className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-800 rounded-xl text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {unresolvedCount} unresolved
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['alerts', 'trust'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500'
              }`}
            >
              {tab === 'alerts' ? `Security Alerts${unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}` : 'Trust Scores'}
            </button>
          ))}
        </div>

        {activeTab === 'alerts' && (
          <>
            {/* Filters */}
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
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">All Clear</p>
                <p className="text-gray-500 text-sm">No security alerts at the moment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAlerts.map((alert) => (
                  <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className={`p-4 ${alert.resolved ? 'opacity-60' : ''}`}>
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
                          <p className="text-xs text-gray-400 mt-1">User: {alert.targetUserName} • {new Date(alert.createdAt).toLocaleString('en-KE')}</p>
                        </div>
                        {!alert.resolved && (
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => handleForceLogout(alert.targetUserId)} className="text-blue-600 hover:text-blue-700 text-xs">
                              <LogOut className="w-3 h-3 mr-1" />Logout
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDisableAccount(alert.targetUserId)} className="text-red-600 hover:text-red-700 text-xs">
                              <Ban className="w-3 h-3 mr-1" />Disable
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleResolveAlert(alert.id)} disabled={resolving === alert.id} className="text-green-600 hover:text-green-700 text-xs">
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

        {activeTab === 'trust' && (
          trustScores.length === 0 ? (
            <div className="text-center py-12">
              <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No trust score data available</p>
              <p className="text-xs text-gray-400 mt-1">Trust scores are calculated from user behavior patterns</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trustScores.map((ts) => (
                <Card key={ts.userId} className={`p-4 ${ts.score < 50 ? 'border-red-200' : ts.score < 75 ? 'border-yellow-200' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{ts.userName}</p>
                      <p className="text-xs text-gray-500 capitalize">{ts.role} • {ts.bypassAttempts} bypass attempts</p>
                      {ts.flags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {ts.flags.map((flag) => (
                            <span key={flag} className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{flag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${ts.score >= 75 ? 'text-green-600' : ts.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {ts.score}
                      </div>
                      <p className="text-xs text-gray-400">Trust Score</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ts.score >= 75 ? 'bg-green-500' : ts.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${ts.score}%` }}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </AdminLayout>
  );
}
