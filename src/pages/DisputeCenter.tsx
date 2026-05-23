import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, MessageSquare, Camera, ChevronLeft,
  Clock, CheckCircle, XCircle, Loader2, RefreshCw,
  AlertOctagon, FileText, Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { isApiConfigured } from '@/config/env';
import ServiceUnavailableState from '@/components/system/ServiceUnavailableState';

type DisputeStatus = 'open' | 'investigating' | 'customer_won' | 'fundi_won' | 'resolved' | 'escalated';

interface Dispute {
  id: string;
  jobId: string;
  jobTitle?: string;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt?: string;
  resolution?: string;
  amount?: number;
}

const STATUS_CONFIG: Record<DisputeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-3.5 h-3.5" /> },
  investigating: { label: 'Investigating', color: 'bg-blue-100 text-blue-800', icon: <AlertOctagon className="w-3.5 h-3.5" /> },
  customer_won: { label: 'Resolved — Customer', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  fundi_won: { label: 'Resolved — Fundi', color: 'bg-purple-100 text-purple-800', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  resolved: { label: 'Resolved', color: 'bg-gray-100 text-gray-800', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  escalated: { label: 'Escalated', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

const DISPUTE_REASONS = [
  'Work not completed as agreed',
  'Fundi did not show up',
  'Poor quality of work',
  'Overcharged / price mismatch',
  'Abusive or unsafe behaviour',
  'Property damage',
  'Off-platform payment pressure',
  'Other',
];

export default function DisputeCenter() {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState({ jobId: '', reason: DISPUTE_REASONS[0], details: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getDisputes() as { disputes?: Dispute[] };
      setDisputes(res.disputes || []);
    } catch (e) {
      console.error('[DisputeCenter]', e);
      setError('Unable to load disputes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  const handleSubmitDispute = async () => {
    if (!form.jobId.trim()) { toast.error('Please enter your Job ID'); return; }
    if (!form.details.trim() || form.details.length < 20) {
      toast.error('Please provide more detail (at least 20 characters)');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.openDispute(form.jobId.trim(), `${form.reason}: ${form.details}`);
      toast.success('Dispute submitted. Our team will review within 24 hours.');
      setShowNewForm(false);
      setForm({ jobId: '', reason: DISPUTE_REASONS[0], details: '' });
      fetchDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold">Dispute Center</h1>
            <p className="text-xs text-muted-foreground">Report issues and get support</p>
          </div>
          <button onClick={fetchDisputes} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
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
            onClick={() => setShowNewForm(!showNewForm)}
            className={showNewForm ? 'w-full' : 'w-full bg-gradient-primary'}
            variant={showNewForm ? 'outline' : 'default'}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {showNewForm ? 'Cancel' : 'Open New Dispute'}
          </Button>
        </div>

        {showNewForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                New Dispute
              </h3>

              <div>
                <label className="block text-sm font-medium mb-1.5">Job ID</label>
                <input
                  type="text"
                  value={form.jobId}
                  onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                  placeholder="Enter the Job ID from your job details"
                  className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You can find the Job ID in your Dashboard under the job details.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Reason</label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                >
                  {DISPUTE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Details</label>
                <textarea
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  placeholder="Describe the issue in detail. Include dates, amounts, and any relevant information..."
                  rows={4}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{form.details.length} / min 20 characters</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Important:</span> False disputes may affect your trust score.
                  Provide honest and accurate information.
                </p>
              </div>

              <Button
                onClick={handleSubmitDispute}
                disabled={submitting || !isApiConfigured()}
                className="w-full bg-gradient-primary"
              >
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : 'Submit Dispute'}
              </Button>
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
                          <p className="font-semibold text-sm truncate">{dispute.jobTitle || `Job ${dispute.jobId?.substring(0, 8)}...`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dispute.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(dispute.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}
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

        {/* Help links */}
        <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
          <h4 className="font-semibold text-sm">Need More Help?</h4>
          <div className="space-y-2">
            <Link to="/contact-support" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <MessageSquare className="w-4 h-4" />Contact Support
            </Link>
            <Link to="/safety-guidelines" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Camera className="w-4 h-4" />Safety Guidelines
            </Link>
            <Link to="/platform-rules" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <FileText className="w-4 h-4" />Platform Rules
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
