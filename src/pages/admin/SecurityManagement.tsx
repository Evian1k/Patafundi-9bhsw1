import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Shield, Loader2, Ban, CheckCircle, LogOut,
  TrendingDown, DollarSign, FileWarning, Users, Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface FraudAlert {
  id: string;
  alert_type: string;
  severity: string;
  message_preview: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  fraud_score?: number;
  status: string;
  resolved_at?: string | null;
  created_at: string;
}

interface TrustScore {
  user_id: string;
  user_name?: string;
  full_name?: string;
  role?: string;
  score: number;
  fraud_score?: number;
  risk_level?: string;
}

interface CommissionDebt {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  job_id?: string;
  amount: number;
  status: string;
  reason: string;
  created_at: string;
}

interface SuspiciousJob {
  id: string;
  job_id: string;
  customer_name?: string;
  fundi_name?: string;
  expected_commission: number;
  payment_received: boolean;
  flagged_suspicious: boolean;
  job_status?: string;
}

type Tab = 'overview' | 'alerts' | 'trust' | 'debts' | 'jobs';

export default function SecurityManagement() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [trustScores, setTrustScores] = useState<TrustScore[]>([]);
  const [debts, setDebts] = useState<CommissionDebt[]>([]);
  const [suspiciousJobs, setSuspiciousJobs] = useState<SuspiciousJob[]>([]);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState("30d");
  const [resolving, setResolving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, alertsRes, trustRes, debtsRes, jobsRes] = await Promise.all([
        apiClient.getFraudDashboard(period) as Promise<{ dashboard?: Record<string, unknown> }>,
        apiClient.getFraudAlerts({ period }) as Promise<{ alerts?: FraudAlert[] }>,
        apiClient.getTrustScores() as Promise<{ scores?: TrustScore[] }>,
        apiClient.getCommissionDebts() as Promise<{ debts?: CommissionDebt[] }>,
        apiClient.getSuspiciousJobs() as Promise<{ jobs?: SuspiciousJob[] }>,
      ]);
      setDashboard(dashRes.dashboard || null);
      setAlerts(alertsRes.alerts || []);
      setTrustScores(trustRes.scores || []);
      setDebts(debtsRes.debts || []);
      setSuspiciousJobs(jobsRes.jobs || []);
    } catch (error) {
      console.error('Error fetching fraud data:', error);
      toast.error('Failed to load fraud dashboard');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleResolveAlert = async (alertId: string) => {
    setResolving(alertId);
    try {
      await apiClient.adminFraudAction({ action: 'resolve', alertId });
      toast.success('Alert resolved');
      fetchAll();
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
      await apiClient.adminFraudAction({ action: 'suspend', userId });
      toast.success('Account suspended');
      fetchAll();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed');
    }
  };

  const handleCreateInvoice = async (debtId: string) => {
    try {
      await apiClient.adminFraudAction({ action: 'invoice', debtId });
      toast.success('Invoice created');
      fetchAll();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed');
    }
  };

  const getSeverityColor = (severity: string) => ({
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  }[severity] || 'bg-gray-100 text-gray-800 border-gray-200');

  const filteredAlerts = alerts.filter((alert) =>
    !alert.resolved_at &&
    (searchQuery
      ? (alert.message_preview || '').toLowerCase().includes(searchQuery.toLowerCase())
        || (alert.user_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      : true)
  );

  const unresolvedCount = alerts.filter((a) => !a.resolved_at).length;
  const dash = dashboard as {
    fraudAlerts?: { open?: number; critical?: number };
    commissionDebts?: { outstanding?: number; recovered?: number };
    suspiciousJobs?: number;
    commissionRevenue?: number;
  } | null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Shield className="w-4 h-4" /> },
    { id: 'alerts', label: `Alerts${unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}`, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'trust', label: 'Trust Scores', icon: <TrendingDown className="w-4 h-4" /> },
    { id: 'debts', label: 'Commission Debts', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'jobs', label: 'Suspicious Jobs', icon: <Briefcase className="w-4 h-4" /> },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Fraud Detection & Revenue Protection</h1>
            <p className="text-gray-500 text-sm">Commission protection, trust scores, debts, and suspicious activity</p>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="today">Today</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
          </select>
        </div>

        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-gray-500'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
            <span className="text-gray-500">Loading fraud intelligence...</span>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                    <div>
                      <p className="text-2xl font-bold">{dash?.fraudAlerts?.open ?? 0}</p>
                      <p className="text-xs text-gray-500">Open Fraud Alerts</p>
                      <p className="text-xs text-red-600">{dash?.fraudAlerts?.critical ?? 0} critical</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-8 h-8 text-amber-500" />
                    <div>
                      <p className="text-2xl font-bold">KES {Number(dash?.commissionDebts?.outstanding ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Outstanding Debts</p>
                      <p className="text-xs text-green-600">KES {Number(dash?.commissionDebts?.recovered ?? 0).toLocaleString()} recovered</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-8 h-8 text-orange-500" />
                    <div>
                      <p className="text-2xl font-bold">{dash?.suspiciousJobs ?? 0}</p>
                      <p className="text-xs text-gray-500">Suspicious Jobs</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">KES {Number(dash?.commissionRevenue ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Commission Revenue</p>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'alerts' && (
              <>
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search alerts..." />
                {filteredAlerts.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-gray-900 font-semibold">All Clear</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAlerts.map((alert) => (
                      <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="p-4">
                          <div className="flex items-start gap-4">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getSeverityColor(alert.severity)}`}>
                                  {alert.severity.toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-400">{alert.alert_type}</span>
                                {alert.fraud_score != null && (
                                  <span className="text-xs text-red-600">Risk: {alert.fraud_score}/100</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{alert.message_preview}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {alert.user_name || alert.user_email} • {new Date(alert.created_at).toLocaleString('en-KE')}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button variant="outline" size="sm" onClick={() => handleForceLogout(alert.user_id)}>
                                <LogOut className="w-3 h-3" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDisableAccount(alert.user_id)}>
                                <Ban className="w-3 h-3" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleResolveAlert(alert.id)} disabled={resolving === alert.id}>
                                {resolving === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'trust' && (
              <div className="space-y-3">
                {trustScores.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No trust score data</p>
                ) : trustScores.map((ts) => (
                  <Card key={ts.user_id} className={`p-4 ${ts.score < 50 ? 'border-red-200' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{ts.user_name || ts.full_name || ts.user_id}</p>
                        <p className="text-xs text-gray-500 capitalize">{ts.role || 'user'}</p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${ts.score >= 75 ? 'text-green-600' : ts.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {ts.score}
                        </div>
                        <p className="text-xs text-gray-400">Trust Score</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${ts.score >= 75 ? 'bg-green-500' : ts.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${ts.score}%` }} />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'debts' && (
              <div className="space-y-3">
                {debts.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-gray-500">No outstanding commission debts</p>
                  </div>
                ) : debts.map((debt) => (
                  <Card key={debt.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{debt.full_name || debt.email}</p>
                        <p className="text-xs text-gray-500">{debt.reason}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(debt.created_at).toLocaleString('en-KE')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-600">KES {Number(debt.amount).toLocaleString()}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{debt.status}</span>
                        {debt.status === 'pending' && (
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => handleCreateInvoice(debt.id)}>
                            <FileWarning className="w-3 h-3 mr-1" />Invoice
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'jobs' && (
              <div className="space-y-3">
                {suspiciousJobs.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-gray-500">No suspicious jobs detected</p>
                  </div>
                ) : suspiciousJobs.map((job) => (
                  <Card key={job.id || job.job_id} className="p-4 border-orange-200">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-semibold text-sm">Job {job.job_id?.slice(0, 8)}...</p>
                        <p className="text-xs text-gray-500">{job.customer_name} → {job.fundi_name}</p>
                        <p className="text-xs text-gray-400">Status: {job.job_status} • Paid: {job.payment_received ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600">KES {Number(job.expected_commission).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">Expected commission</p>
                        {job.flagged_suspicious && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Flagged</span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
