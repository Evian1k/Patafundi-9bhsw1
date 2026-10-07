import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, ChevronLeft, Clock, CheckCircle, Loader2, RefreshCw,
  AlertOctagon, Scale, Plus, Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import ServiceUnavailableState from '@/components/system/ServiceUnavailableState';
import { DisputeForm } from '@/components/support/ReportProblemModal';
import { HelpLinksInline } from '@/components/support/HelpKit';

// Backend dispute statuses (disputeController): open, under_review, resolved.
type DisputeStatus = 'open' | 'under_review' | 'resolved';

// listDisputes returns raw DB rows: snake_case columns + joined job fields.
interface Dispute {
  id: string;
  job_id: string;
  job_title?: string | null;
  booking_number?: string | null;
  service_category?: string | null;
  reason: string;
  status: DisputeStatus;
  created_at: string;
  updated_at?: string;
  resolution?: string | null;
  amount?: number;
}

const STATUS_CONFIG: Record<DisputeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-3.5 h-3.5" /> },
  under_review: { label: 'Under Review', color: 'bg-blue-100 text-blue-800', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3.5 h-3.5" /> },
};

interface RefundRequest {
  id: string;
  job_id: string;
  amount: string | number;
  reason: string;
  status: 'requested' | 'under_review' | 'approved' | 'rejected' | 'processing' | 'completed' | 'cancelled';
  review_notes?: string | null;
  service_category?: string | null;
  created_at: string;
}

const REFUND_STATUS_CONFIG: Record<RefundRequest['status'], { label: string; color: string }> = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800' },
  under_review: { label: 'Under review', color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Refunded', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Declined', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
};

export default function DisputeCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkedJob = searchParams.get('job') || undefined;

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(Boolean(deepLinkedJob));
  const [formKey, setFormKey] = useState(0);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [disputeRes, refundRes] = await Promise.allSettled([
        apiClient.getDisputes() as Promise<{ disputes?: Dispute[] }>,
        apiClient.listMyRefundRequests() as Promise<{ refundRequests?: RefundRequest[] }>,
      ]);
      if (disputeRes.status === 'rejected') {
        setError('Unable to load disputes. Please try again.');
        setDisputes([]);
      } else {
        setDisputes(disputeRes.value.disputes || []);
      }
      // Refunds are customer-scoped; a 403/404 for other roles is expected.
      setRefunds(refundRes.status === 'fulfilled' ? refundRes.value.refundRequests || [] : []);
    } catch (e) {
      console.error('[DisputeCenter]', e);
      setError('Unable to load disputes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Go back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold">Dispute Center</h1>
            <p className="text-xs text-muted-foreground">Report issues and get support - all in one place</p>
          </div>
          <button onClick={fetchDisputes} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-10 space-y-5">
        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <Scale className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-blue-800 text-sm">Fair Dispute Resolution</p>
            <p className="text-xs text-blue-700 mt-1">
              PataFundi mediates all disputes fairly. Escrow funds are held until resolution.
              Our team typically responds within 24 hours.
            </p>
          </div>
        </div>

        {/* Open new dispute */}
        <div>
          <Button
            onClick={() => { setShowNewForm(!showNewForm); setFormKey((k) => k + 1); }}
            className={showNewForm ? 'w-full' : 'w-full bg-gradient-primary'}
            variant={showNewForm ? 'outline' : 'default'}
          >
            <Plus className="w-4 h-4 mr-2" />
            {showNewForm ? 'Cancel' : 'Report a Problem'}
          </Button>
        </div>

        {showNewForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                New Dispute
              </h3>
              <DisputeForm
                key={formKey}
                fixedJobId={deepLinkedJob}
                onSubmitted={() => {
                  setShowNewForm(false);
                  fetchDisputes();
                }}
              />
            </Card>
          </motion.div>
        )}

        {/* Disputes list */}
        <div>
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
            Your Disputes {disputes.length > 0 && `(${disputes.length})`}
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Loading disputes...</span>
            </div>
          ) : error ? (
            <ServiceUnavailableState
              title="Disputes Unavailable"
              description={error}
              onRetry={fetchDisputes}
              compact
            />
          ) : disputes.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-2xl border border-border/50">
              <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-2" />
              <p className="font-semibold text-sm">No disputes</p>
              <p className="text-xs text-muted-foreground mt-0.5">You have no open or past disputes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map((dispute, i) => {
                const cfg = STATUS_CONFIG[dispute.status] || STATUS_CONFIG.open;
                return (
                  <motion.div
                    key={dispute.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {dispute.job_title || dispute.service_category?.replace(/_/g, ' ') || 'Job'}
                            {dispute.booking_number ? (
                              <span className="font-mono text-xs text-muted-foreground font-normal"> · {dispute.booking_number}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dispute.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {dispute.created_at ? new Date(dispute.created_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </div>

                      {dispute.resolution && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-xl">
                          <p className="text-xs font-medium mb-0.5">Resolution</p>
                          <p className="text-xs text-muted-foreground">{dispute.resolution}</p>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Refund requests (spec §38): customers track money requests here */}
        {refunds.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Your Refund Requests ({refunds.length})
            </h3>
            <div className="space-y-3">
              {refunds.map((refund) => {
                const cfg = REFUND_STATUS_CONFIG[refund.status] || REFUND_STATUS_CONFIG.requested;
                return (
                  <Card key={refund.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">
                          {formatMoney(refund.amount)}
                          {refund.service_category ? (
                            <span className="font-normal text-muted-foreground"> - {refund.service_category.replace(/_/g, ' ')}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{refund.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(refund.created_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {refund.review_notes && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-xl">
                        <p className="text-xs font-medium mb-0.5">Team notes</p>
                        <p className="text-xs text-muted-foreground">{refund.review_notes}</p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Help - opens right here, never redirects */}
        <HelpLinksInline title="Need more help?" />
      </div>
    </div>
  );
}
