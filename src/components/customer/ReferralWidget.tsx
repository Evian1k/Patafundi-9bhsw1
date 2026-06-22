/**
 * Referral Widget — customer-facing referral dashboard section.
 * Shows: code, share link, invites, vouchers, savings.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Check, Users, Trophy, Wallet, Clock, Sparkles } from "lucide-react";

interface Voucher {
  id: string;
  code: string;
  discountPercentage: number;
  maxDiscountKes: number;
  expiresAt: string;
  daysRemaining: number;
}

interface RedeemedVoucher {
  id: string;
  code: string;
  discountPercentage: number;
  discountAppliedKes: number;
  redeemedAt: string;
  jobId: string;
  serviceCategory: string;
}

interface ReferralDashboard {
  code: string | null;
  shareLink: string | null;
  stats: {
    shares: number;
    signups: number;
    completed: number;
    vouchersEarned: number;
    vouchersRedeemed: number;
    totalSavingsKes: number;
  };
  referrals: Array<{
    id: string;
    status: string;
    createdAt: string;
    voucherIssuedAt: string | null;
    refereeName: string;
    refereeEmail: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    fraudCheckPassed: boolean;
    blockedReason: string | null;
  }>;
  activeVouchers: Voucher[];
  redeemedVouchers: RedeemedVoucher[];
}

export function ReferralWidget() {
  const { toast } = useToast();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    apiClient.getMyReferralDashboard()
      .then((d: any) => setData(d))
      .catch(() => toast({ title: "Failed to load referral data", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const copy = async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      toast({ title: `${what === "code" ? "Code" : "Link"} copied!` });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-slate-100 rounded w-1/3" />
          <div className="h-20 bg-slate-100 rounded" />
          <div className="h-20 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Hero card — referral code + share */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 border border-primary/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Refer & Earn
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Share your code. When your friend completes their first paid job, you get a 2% discount voucher (max KES 500) for your next booking.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Your referral code</div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-lg font-mono font-bold text-primary">{data.code || "—"}</code>
              <button
                onClick={() => data.code && copy(data.code, "code")}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Copy code"
              >
                {copied === "code" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Share link</div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-slate-700 truncate">{data.shareLink || "—"}</code>
              <button
                onClick={() => data.shareLink && copy(data.shareLink, "link")}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                aria-label="Copy link"
              >
                {copied === "link" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Invites sent" value={data.stats.shares} />
        <StatCard icon={Users} label="Signups" value={data.stats.signups} />
        <StatCard icon={Trophy} label="Vouchers earned" value={data.stats.vouchersEarned} />
        <StatCard icon={Wallet} label="Total savings" value={`KES ${data.stats.totalSavingsKes.toLocaleString()}`} />
      </div>

      {/* Active vouchers */}
      {data.activeVouchers.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Active vouchers ({data.activeVouchers.length})
          </h4>
          <div className="space-y-2">
            {data.activeVouchers.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div>
                  <div className="font-mono font-bold text-amber-900">{v.code}</div>
                  <div className="text-xs text-amber-700">{v.discountPercentage}% off next job (max KES {v.maxDiscountKes.toLocaleString()})</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-amber-700 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {v.daysRemaining}d left
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500 mt-2">
              💡 Your voucher will be applied automatically on your next job creation.
            </p>
          </div>
        </div>
      )}

      {/* Recent referrals */}
      {data.referrals.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Recent referrals</h4>
          <div className="space-y-2">
            {data.referrals.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-900">{r.refereeName}</div>
                  <div className="text-xs text-slate-500">{r.refereeEmail}</div>
                </div>
                <ReferralStatusBadge status={r.status} blocked={!!r.blockedReason} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redeemed history */}
      {data.redeemedVouchers.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Voucher history</h4>
          <div className="space-y-2">
            {data.redeemedVouchers.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm font-mono text-slate-900">{v.code}</div>
                  <div className="text-xs text-slate-500">{v.serviceCategory} • {new Date(v.redeemedAt).toLocaleDateString()}</div>
                </div>
                <div className="text-sm font-semibold text-green-600">−KES {v.discountAppliedKes.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ReferralStatusBadge({ status, blocked }: { status: string; blocked: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-slate-100 text-slate-700" },
    completed: { label: "Completed", cls: "bg-blue-100 text-blue-700" },
    rewarded: { label: "Rewarded", cls: "bg-green-100 text-green-700" },
    expired: { label: blocked ? "Blocked" : "Expired", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] || map.pending;
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}
