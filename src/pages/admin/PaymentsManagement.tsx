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

export default function PaymentsManagement() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [escrowQueue, setEscrowQueue] = useState<EscrowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'escrow'>('transactions');
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

  useEffect(() => {
    fetchTransactions();
    fetchEscrowQueue();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(amount || 0);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

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
          {(['transactions', 'escrow'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'escrow' ? `Escrow Queue ${escrowQueue.length > 0 ? `(${escrowQueue.length})` : ''}` : 'Transactions'}
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
                        <p className="text-xs text-red-600 font-medium mt-1">⚠ Payment overdue — potential bypass detected</p>
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
      </div>
    </AdminLayout>
  );
}
