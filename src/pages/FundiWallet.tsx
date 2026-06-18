import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle,
  AlertCircle, RefreshCw, ChevronLeft, TrendingUp, Shield,
  Phone, Loader2, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { isApiConfigured } from '@/config/env';
import { demoWalletData, DEMO_MODE } from '@/lib/demo';
import ServiceUnavailableState from '@/components/system/ServiceUnavailableState';

interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit' | 'escrow' | 'payout';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

interface WalletData {
  balance: number;
  escrowPending: number;
  totalEarnings: number;
  transactions: WalletTransaction[];
}

function formatKES(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TransactionIcon({ type }: { type: string }) {
  if (type === 'credit' || type === 'payout') return <ArrowDownLeft className="w-4 h-4 text-green-600" />;
  if (type === 'debit') return <ArrowUpRight className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
}

function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function FundiWallet() {
  const navigate = useNavigate();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const fetchWallet = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      if (DEMO_MODE) {
        setData(demoWalletData as WalletData);
        return;
      }
      const [balRes, txRes] = await Promise.all([
        apiClient.getFundiWalletBalance() as Promise<{ balance?: number; escrowPending?: number; totalEarnings?: number }>,
        apiClient.getFundiWalletTransactions(20, 0) as Promise<{ transactions?: WalletTransaction[] }>,
      ]);
      setData({
        balance: balRes?.balance ?? 0,
        escrowPending: balRes?.escrowPending ?? 0,
        totalEarnings: balRes?.totalEarnings ?? 0,
        transactions: txRes?.transactions ?? [],
      });
    } catch (e) {
      console.error('[FundiWallet] fetch error:', e);
      if (DEMO_MODE) {
        setData(demoWalletData as WalletData);
      } else {
        setError('Unable to load wallet. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 100) { toast.error('Minimum withdrawal is KES 100'); return; }
    if (!mpesaNumber || !/^(?:\+254|0)7\d{8}$/.test(mpesaNumber.replace(/\s/g, ''))) {
      toast.error('Please enter a valid Safaricom M-Pesa number');
      return;
    }
    if (data && amount > data.balance) { toast.error('Insufficient balance'); return; }

    setWithdrawing(true);
    try {
      await apiClient.submitWithdrawalRequest(amount, mpesaNumber);
      toast.success(`Withdrawal of ${formatKES(amount)} initiated to ${mpesaNumber}`);
      setWithdrawAmount('');
      setMpesaNumber('');
      setShowWithdrawForm(false);
      fetchWallet(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-hero">
        <div className="max-w-lg mx-auto px-4 py-6">
          <button onClick={() => navigate('/fundi')} className="flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />Back to Dashboard
          </button>
          <ServiceUnavailableState
            title="Wallet Unavailable"
            description={error}
            onRetry={() => fetchWallet()}
          />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/fundi')} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold">My Wallet</h1>
            {DEMO_MODE && <p className="text-xs text-amber-600">Demo mode</p>}
          </div>
          <button onClick={() => fetchWallet(true)} className="p-2 hover:bg-muted rounded-xl transition-colors" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-primary rounded-3xl p-6 text-white shadow-glow"
        >
          <p className="text-white/70 text-sm mb-1">Available Balance</p>
          <p className="text-4xl font-bold font-display mb-4">{formatKES(data.balance)}</p>

          <div className="flex gap-4 mb-6">
            <div className="flex-1 bg-white/10 rounded-2xl p-3">
              <p className="text-white/60 text-xs mb-0.5">In Escrow</p>
              <p className="font-bold text-sm">{formatKES(data.escrowPending)}</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-2xl p-3">
              <p className="text-white/60 text-xs mb-0.5">Total Earned</p>
              <p className="font-bold text-sm">{formatKES(data.totalEarnings)}</p>
            </div>
          </div>

          <button
            onClick={() => setShowWithdrawForm(!showWithdrawForm)}
            disabled={data.balance < 100}
            className="w-full h-11 rounded-2xl bg-white text-primary font-semibold text-sm hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showWithdrawForm ? 'Cancel Withdrawal' : 'Withdraw to M-Pesa'}
          </button>
        </motion.div>

        {/* Escrow info */}
        {data.escrowPending > 0 && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Escrow Hold: {formatKES(data.escrowPending)}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Funds are held securely until the customer confirms job completion. 
                This protects both you and the customer.
              </p>
            </div>
          </div>
        )}

        {/* Withdrawal form */}
        {showWithdrawForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="p-5 space-y-4">
              <h3 className="font-semibold">Withdraw Funds</h3>

              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (KES)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Min. KES 100"
                  min={100}
                  max={data.balance}
                  className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                />
                <p className="text-xs text-muted-foreground mt-1">Available: {formatKES(data.balance)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />M-Pesa Number</span>
                </label>
                <input
                  type="tel"
                  value={mpesaNumber}
                  onChange={(e) => setMpesaNumber(e.target.value)}
                  placeholder="0712345678"
                  className="w-full h-11 px-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                />
              </div>

              <div className="p-3 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground">
                  Withdrawals are processed within 1–3 business days. A small M-Pesa transaction fee may apply.
                </p>
              </div>

              <Button
                onClick={handleWithdraw}
                disabled={withdrawing || !withdrawAmount || !mpesaNumber || !isApiConfigured()}
                className="w-full bg-gradient-primary"
              >
                {withdrawing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                ) : (
                  'Confirm Withdrawal'
                )}
              </Button>
            </Card>
          </motion.div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: 'Total Earned', value: formatKES(data.totalEarnings), color: 'text-emerald-600 bg-emerald-50' },
            { icon: Clock, label: 'In Escrow', value: formatKES(data.escrowPending), color: 'text-yellow-600 bg-yellow-50' },
            { icon: Star, label: 'Transactions', value: data.transactions.length, color: 'text-blue-600 bg-blue-50' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-card rounded-2xl p-3 border border-border/50 text-center">
              <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center mb-1.5 mx-auto`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <p className="font-bold text-sm leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Transaction history */}
        <div>
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Transaction History</h3>
          {data.transactions.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-2xl border border-border/50">
              <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Complete jobs to start earning</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-card rounded-2xl p-4 border border-border/50 flex items-center gap-3"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    tx.type === 'credit' || tx.type === 'payout' ? 'bg-green-50' :
                    tx.type === 'debit' ? 'bg-red-50' : 'bg-yellow-50'
                  }`}>
                    <TransactionIcon type={tx.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${
                      tx.type === 'credit' || tx.type === 'payout' ? 'text-green-600' :
                      tx.type === 'debit' ? 'text-red-500' : 'text-yellow-600'
                    }`}>
                      {tx.type === 'debit' ? '-' : '+'}{formatKES(tx.amount)}
                    </p>
                    <TxStatusBadge status={tx.status} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Payout rules */}
        <div className="bg-muted/50 rounded-2xl p-4 space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />Payout Rules
          </h4>
          {[
            'Customer must confirm job completion with OTP',
            'No active dispute on the completed job',
            'Escrow hold window must have expired',
            'Trust score must be above minimum threshold',
            'Withdrawals require verified M-Pesa number',
          ].map((rule) => (
            <div key={rule} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
