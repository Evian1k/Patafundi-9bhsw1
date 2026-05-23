import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Scale, Search, CheckCircle, Clock, AlertOctagon,
  Loader2, RefreshCw, AlertTriangle, DollarSign,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';

type DisputeStatus = 'open' | 'investigating' | 'customer_won' | 'fundi_won' | 'resolved' | 'escalated';

interface Dispute {
  id: string;
  jobId: string;
  customerName: string;
  fundiName: string;
  reason: string;
  status: DisputeStatus;
  amount?: number;
  createdAt: string;
  updatedAt?: string;
  resolution?: string;
}

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  investigating: 'bg-blue-100 text-blue-800 border-blue-200',
  customer_won: 'bg-green-100 text-green-800 border-green-200',
  fundi_won: 'bg-purple-100 text-purple-800 border-purple-200',
  resolved: 'bg-gray-100 text-gray-800 border-gray-200',
  escalated: 'bg-red-100 text-red-800 border-red-200',
};

export default function AdminDisputeManagement() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getAdminDisputes(1, statusFilter || undefined) as {
        disputes?: Dispute[];
      };
      setDisputes(res.disputes || []);
    } catch (e) {
      console.error('[AdminDisputes]', e);
      toast.error('Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  const handleResolve = async (outcome: 'customer_won' | 'fundi_won' | 'resolved') => {
    if (!selected) return;
    if (!resolution.trim()) { toast.error('Please enter a resolution note'); return; }
    setResolving(true);
    try {
      await apiClient.resolveDispute(
        selected.id,
        `${outcome}: ${resolution}`,
        refundAmount ? parseFloat(refundAmount) : undefined,
      );
      toast.success('Dispute resolved successfully');
      setSelected(null);
      setResolution('');
      setRefundAmount('');
      fetchDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setResolving(false);
    }
  };

  const filtered = disputes.filter((d) =>
    searchQuery
      ? d.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.fundiName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.jobId?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const openCount = disputes.filter((d) => d.status === 'open' || d.status === 'escalated').length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="w-6 h-6 text-primary" />
              Dispute Center
            </h1>
            <p className="text-gray-500 text-sm">Review and resolve customer/fundi disputes</p>
          </div>
          <div className="flex items-center gap-2">
            {openCount > 0 && (
              <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-xl text-sm font-medium">
                {openCount} need attention
              </span>
            )}
            <Button onClick={fetchDisputes} disabled={loading} variant="outline" size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer, fundi, job ID..."
                className="pl-9"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="customer_won">Customer Won</option>
            <option value="fundi_won">Fundi Won</option>
          </select>
        </div>

        {/* Main layout */}
        <div className={`grid gap-6 ${selected ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* List */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-gray-500">Loading disputes...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="font-semibold text-gray-900">No disputes found</p>
                <p className="text-gray-500 text-sm mt-1">
                  {statusFilter === 'open' ? 'All disputes have been resolved.' : 'Try adjusting your filters.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((dispute, i) => {
                  const color = STATUS_COLORS[dispute.status] || STATUS_COLORS.open;
                  return (
                    <motion.div
                      key={dispute.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Card
                        className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                          selected?.id === dispute.id ? 'ring-2 ring-primary border-primary' : ''
                        }`}
                        onClick={() => { setSelected(dispute); setResolution(''); setRefundAmount(''); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">
                              {dispute.customerName} vs {dispute.fundiName}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dispute.reason}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                              <span>{new Date(dispute.createdAt).toLocaleDateString('en-KE')}</span>
                              {dispute.amount && (
                                <span className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  KES {dispute.amount.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${color}`}>
                            {dispute.status.replace('_', ' ')}
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resolution panel */}
          {selected && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="p-5 sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Resolve Dispute</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                </div>

                <div className="space-y-3 mb-5">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Customer</p>
                    <p className="font-medium text-sm">{selected.customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Fundi</p>
                    <p className="font-medium text-sm">{selected.fundiName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Reason</p>
                    <p className="text-sm text-gray-700">{selected.reason}</p>
                  </div>
                  {selected.amount && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Amount in Escrow</p>
                      <p className="font-bold text-primary">KES {selected.amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Resolution Notes</label>
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Document your resolution decision..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Refund Amount (KES, optional)</label>
                    <Input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0"
                      min={0}
                      max={selected.amount}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <Button
                      onClick={() => handleResolve('customer_won')}
                      disabled={resolving}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      Customer Won
                    </Button>
                    <Button
                      onClick={() => handleResolve('fundi_won')}
                      disabled={resolving}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                    >
                      Fundi Won
                    </Button>
                    <Button
                      onClick={() => handleResolve('resolved')}
                      disabled={resolving}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resolve'}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
