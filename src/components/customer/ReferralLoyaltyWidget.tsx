/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Referral + Loyalty Dashboard Widget
 * Shows referral code, invite link, referral stats, and loyalty tier.
 * Designed to be embedded in the customer Dashboard page.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gift, Copy, Check, Users, Star, Crown, Award } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp } from "@/lib/motion";
import { toast } from "sonner";

const TIER_INFO: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  bronze:   { icon: Award,  color: "text-amber-700",  bg: "bg-amber-100",  label: "Bronze" },
  silver:   { icon: Award,  color: "text-slate-500",  bg: "bg-slate-100",  label: "Silver" },
  gold:     { icon: Star,   color: "text-yellow-600",  bg: "bg-yellow-100", label: "Gold" },
  platinum: { icon: Crown,  color: "text-cyan-600",    bg: "bg-cyan-100",   label: "Platinum" },
  diamond:  { icon: Crown,  color: "text-purple-600",  bg: "bg-purple-100", label: "Diamond" },
};

export default function ReferralLoyaltyWidget() {
  const reduceMotion = useReducedMotion();
  const [referral, setReferral] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [refData, loyData] = await Promise.all([
          apiClient.getMyReferralDashboard() as any,
          apiClient.request("/loyalty/me", { includeAuth: true }) as any,
        ]);
        setReferral(refData);
        setLoyalty(loyData.loyalty);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyReferralCode = async () => {
    if (!referral?.code) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const shareLink = referral?.shareLink || "";

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success("Invite link copied! Share it with friends.");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (loading) {
    return <div className="animate-pulse h-48 bg-muted rounded-2xl" />;
  }

  const tier = TIER_INFO[loyalty?.tier || "bronze"] || TIER_INFO.bronze;
  const TierIcon = tier.icon;

  return (
    <motion.div
      initial={reduceMotion ? {} : "hidden"}
      animate="visible"
      variants={fadeUp}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {/* Referral Card */}
      <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Refer & Earn</h3>
            <p className="text-xs text-slate-500">Get a 2% discount voucher (max KES 500) when friends complete their first paid job</p>
          </div>
        </div>

        {/* Referral code */}
        <div className="mb-3">
          <label className="text-xs text-slate-500 mb-1 block">Your Referral Code</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-slate-50 rounded-lg font-mono text-sm font-bold text-primary">
              {referral?.code || "—"}
            </div>
            <button
              onClick={copyReferralCode}
              className="p-2 text-slate-400 hover:text-primary rounded-lg hover:bg-primary/5"
              title="Copy code"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Share link */}
        {shareLink && (
          <button
            onClick={copyShareLink}
            className="w-full px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors text-center"
          >
            Copy invite link
          </button>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/30">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{referral?.stats?.shares || 0}</div>
            <div className="text-[10px] text-slate-500">Invited</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{referral?.stats?.vouchersEarned || 0}</div>
            <div className="text-[10px] text-slate-500">Vouchers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary">KES {Number(referral?.stats?.totalSavingsKes || 0).toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Saved</div>
          </div>
        </div>

        {/* Active vouchers */}
        {referral?.activeVouchers && referral.activeVouchers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <div className="text-xs text-slate-500 mb-2 font-medium">Active vouchers</div>
            {referral.activeVouchers.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-lg mb-1">
                <code className="text-xs font-mono font-bold text-amber-900">{v.code}</code>
                <span className="text-xs text-amber-700">{v.discountPercentage}% off • {v.daysRemaining}d left</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loyalty Card */}
      <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-10 h-10 rounded-xl ${tier.bg} flex items-center justify-center`}>
            <TierIcon className={`w-5 h-5 ${tier.color}`} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Loyalty Program</h3>
            <p className="text-xs text-slate-500">Earn points with every job</p>
          </div>
        </div>

        {/* Current tier */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className={`text-2xl font-bold ${tier.color} capitalize`}>{tier.label}</div>
            <div className="text-xs text-slate-500">{loyalty?.points || 0} points</div>
          </div>
          <Users className="w-8 h-8 text-slate-200" />
        </div>

        {/* Tier progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>Bronze</span>
            <span>Silver</span>
            <span>Gold</span>
            <span>Platinum</span>
            <span>Diamond</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-purple-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((loyalty?.points || 0) / 5000) * 100)}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/30">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{loyalty?.jobs_completed || 0}</div>
            <div className="text-[10px] text-slate-500">Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">KES {Math.round(Number(loyalty?.total_spent || 0)).toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Spent</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary">{loyalty?.points || 0}</div>
            <div className="text-[10px] text-slate-500">Points</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
