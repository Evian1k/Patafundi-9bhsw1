import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CreditCard, DollarSign, Loader2, TrendingUp, Wallet, CheckCircle, Clock, AlertOctagon, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface Transaction {
  id: string;
  jobId: string;
  customerId: string;
  customerName: string;
  fundiId: string;
  fundiName: string;
  amount: number;
  commission: number;
  fundiEarnings?: number;
  status: string;
  paymentMethod?: string;
  createdAt: string;
}

interface EscrowItem {
  jobId: string;
  customerName: string;
  fundiName: string;
  amount: number;
  completedAt: string;
  hoursElapsed: number;
  flagged: boolean;
}

interface ReconciliationItem {
  id: string;
  job_id: string;
  booking_number?: string | null;
  customer_name: string;
  amount: number;
  currency: string;
  provider?: string | null;
  provider_amount?: number | null;
  provider_stage?: string | null;
  provider_outcome?: string | null;
  reconciliation_reason?: string | null;
  provider_message?: string | null;
  created_at: string;
}

export default function PaymentsManagement() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [escrowQueue, setEscrowQueue] = useState<EscrowItem[]>([]);
  const [reconciliationQueue, setReconciliationQueue] = useState<ReconciliationItem[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { evidenceReference: string; notes: string }>>({});
  const [reviewingPayment, setReviewingPayment] = useState<string | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [canReconcile, setCanReconcile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'escrow' | 'reconciliation'>('transactions');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const response = await apiClient.request('/admin/transactions', { includeAuth: true }) as {
        transactions?: Transaction[];
        totalRevenue?: number;
        totalCommission?: number;
        count?: number;
      };
      setTransactions(response.transactions || []);
      setTotalRevenue(response.totalRevenue || 0);
      setTotalCommission(response.totalCommission || 0);
      setTransactionCount(response.count || 0);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const fetchEscrowQueue = async () => {
    try {
      const response = await apiClient.getEscrowQueue() as { queue?: EscrowItem[] };
      setEscrowQueue(response.queue || []);
    } catch { /* API endpoint may not exist yet */ }
  };

  const fetchReconciliationQueue = async () => {
    setReconciliationLoading(true);
    try {
      const response = await apiClient.request('/admin/payments/reconciliation') as { reconciliations?: ReconciliationItem[] };
      setReconciliationQueue(response.reconciliations || []);
    } catch (error) {
      console.error('Error fetching payment reconciliation queue:', error);
      toast.error('Failed to load payment reviews');
    } finally {
      setReconciliationLoading(false);
    }
  };

  const submitReconciliationReview = async (item: ReconciliationItem, action: 'record_review' | 'confirm_no_charge') => {
    if (!canReconcile) {
      toast.error('You do not have permission to review payments');
      return;
    }
    const draft = reviewDrafts[item.id];
    if (!draft?.evidenceReference.trim()) {
      toast.error('Enter the provider or case evidence reference first');
      return;
    }
    if (action === 'confirm_no_charge' && !window.confirm('Confirm from provider evidence that no charge was made? This will allow the customer to retry payment.')) return;
    setReviewingPayment(item.id);
    try {
      await apiClient.request(`/admin/payments/${item.id}/reconciliation-review`, {
        method: 'POST',
        body: { action, evidenceReference: draft.evidenceReference, notes: draft.notes },
      });
      toast.success(action === 'confirm_no_charge' ? 'No-charge decision recorded; customer may retry' : 'Review evidence recorded; payment remains under review');
      await fetchReconciliationQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record payment review');
    } finally {
      setReviewingPayment(null);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchEscrowQueue();
    let active = true;
    const loadReconciliationPermission = async () => {
      try {
        const data = await apiClient.request('/staff/me/permissions') as { role?: string; permissions?: string[] };
        const allowed = data.role === 'super_admin' || (data.permissions || []).includes('can_reconcile_payments');
        if (!active) return;
        setCanReconcile(allowed);
        if (allowed) await fetchReconciliationQueue();
      } catch {
        if (active) setCanReconcile(false);
      }
    };
    void loadReconciliationPermission();
    return () => { active = false; };
  }, []);

  const formatCurrency = (amount: number, currency = 'KES') =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      reconciliation_required: 'bg-amber-100 text-amber-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const tabs: Array<'transactions' | 'escrow' | 'reconciliation'> = canReconcile
    ? ['transactions', 'escrow', 'reconciliation']
    : ['transactions', 'escrow'];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments & Finance</h1>
          <p className="text-gray-500 text-sm">Monitor transactions, escrow, and platform revenue</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-emerald-600 bg-emerald-50' },
            { icon: Wallet, label: 'Commission Earned', value: formatCurrency(totalCommission), color: 'text-primary bg-primary/10' },
            { icon: CreditCard, label: 'Transactions', value: transactionCount.toLocaleString(), color: 'text-blue-600 bg-blue-50' },
            { icon: Shield, label: 'Escrow Queue', value: escrowQueue.length.toLocaleString(), color: escrowQueue.some(e => e.flagged) ? 'text-red-600 bg-red-50' : 'text-orange-600 bg-orange-50' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="p-4">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900">{loading ? '...' : value}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'escrow'
                ? `Escrow Queue ${escrowQueue.length > 0 ? `(${escrowQueue.length})` : ''}`
                : tab === 'reconciliation'
                  ? `Payment Reviews ${reconciliationQueue.length > 0 ? `(${reconciliationQueue.length})` : ''}`
                  : 'Transactions'}
            </button>
          ))}
        </div>

        {/* Transactions tab */}
        {activeTab === 'transactions' && (
          loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-gray-500">Loading transactions...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Job ID', 'Customer', 'Fundi', 'Amount', 'Commission', 'Fundi Earnings', 'Method', 'Status', 'Date'].map((h) => (
                      <th key={h} className="text-left text-xs text-gray-500 font-medium pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono text-xs text-gray-500">{tx.jobId?.substring(0, 8)}...</td>
                      <td className="py-3 pr-4 font-medium">{tx.customerName}</td>
                      <td className="py-3 pr-4 text-gray-600">{tx.fundiName}</td>
                      <td className="py-3 pr-4 font-semibold text-gray-900">{formatCurrency(tx.amount)}</td>
                      <td className="py-3 pr-4 text-primary font-medium">{formatCurrency(tx.commission)}</td>
                      <td className="py-3 pr-4 text-green-700">{formatCurrency(tx.fundiEarnings || (tx.amount - tx.commission))}</td>
                      <td className="py-3 pr-4 capitalize text-gray-500">{tx.paymentMethod || 'mpesa'}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-gray-400">{formatDate(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Escrow tab */}
        {activeTab === 'escrow' && (
          escrowQueue.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Escrow queue is clear</p>
              <p className="text-xs text-gray-400">All completed jobs have been paid</p>
            </div>
          ) : (
            <div className="space-y-3">
              {escrowQueue.map((item) => (
                <Card key={item.jobId} className={`p-4 ${item.flagged ? 'border-red-200 bg-red-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {item.flagged && <AlertOctagon className="w-4 h-4 text-red-500" />}
                        <p className="font-semibold text-sm">{item.customerName} → {item.fundiName}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Job completed {item.hoursElapsed}h ago • {formatCurrency(item.amount)}</p>
                      {item.flagged && (
                        <p className="text-xs text-red-600 font-medium mt-1">⚠ Payment overdue - potential bypass detected</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${item.flagged ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {item.flagged ? 'Flagged' : 'Pending'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
        {canReconcile && activeTab === 'reconciliation' && (
          reconciliationLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary mr-2" /><span className="text-gray-500">Loading payment reviews...</span></div>
          ) : reconciliationQueue.length === 0 ? (
            <div className="text-center py-12"><CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">No payments need reconciliation</p><p className="text-xs text-gray-400">Provider-unknown and unapplied payments will appear here.</p></div>
          ) : (
            <div className="space-y-3">
              {reconciliationQueue.map((item) => {
                const draft = reviewDrafts[item.id] || { evidenceReference: '', notes: '' };
                return (
                  <Card key={item.id} className="p-4 border-amber-200">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{item.customer_name} · {formatCurrency(Number(item.amount), item.currency || 'KES')}</p>
                        <p className="text-xs text-gray-500 mt-1">Booking {item.booking_number || item.job_id} · Payment {item.id}</p>
                        <p className="text-xs text-gray-500">{item.provider || 'Payment provider'} · {item.provider_stage || 'callback'} · {item.provider_outcome || 'review required'} · {formatDate(item.created_at)}</p>
                        {item.provider_amount != null && Number(item.provider_amount) !== Number(item.amount) ? <p className="text-xs text-amber-700 mt-1">Provider-reported amount: {formatCurrency(Number(item.provider_amount), item.currency || 'KES')}</p> : null}
                        {item.reconciliation_reason ? <p className="text-xs text-gray-600 mt-1">Reason: {item.reconciliation_reason}</p> : null}
                        {item.provider_message ? <p className="text-xs text-gray-600 mt-1">Provider message: {item.provider_message}</p> : null}
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">Review required</span>
                    </div>
                    <div className="grid gap-2 mt-4 md:grid-cols-2">
                      <input
                        aria-label="Provider or case evidence reference"
                        value={draft.evidenceReference}
                        onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...draft, evidenceReference: event.target.value } }))}
                        placeholder="Provider or case evidence reference"
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        aria-label="Review notes"
                        value={draft.notes}
                        onChange={(event) => setReviewDrafts((current) => ({ ...current, [item.id]: { ...draft, notes: event.target.value } }))}
                        placeholder="Review notes (optional)"
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button variant="outline" disabled={reviewingPayment === item.id} onClick={() => submitReconciliationReview(item, 'record_review')}>
                        {reviewingPayment === item.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Record review; keep blocked
                      </Button>
                      <Button variant="destructive" disabled={reviewingPayment === item.id} onClick={() => submitReconciliationReview(item, 'confirm_no_charge')}>
                        Confirm no charge; allow retry
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">A provider-confirmed successful charge cannot be marked unpaid. Refunds or reversals are not executed by this review action.</p>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
    </AdminLayout>
  );
}
