/**
 * Referral Campaign Dashboard — super_admin / fraud_analyst / finance_team
 *
 * Features:
 *  - View campaign performance (vouchers issued, redeemed, total discounts)
 *  - Create new campaigns (sunday/promo with start/end dates)
 *  - Pause / Resume / Disable campaigns
 *  - View top referrers
 *  - View fraud attempts with review capability
 *  - View conversion funnel
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Gift, Plus, Pause, Play, X, AlertTriangle, TrendingUp,
  Users, Award, DollarSign, Activity, Shield,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  campaign_type: string;
  discount_percentage: string;
  max_discount_kes: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  redemptions_count: number;
  max_redemptions: number | null;
  vouchers_issued: number;
  vouchers_redeemed: number;
  total_discount_kes: string;
}

interface Analytics {
  overview: {
    total_referrals: number;
    completed_referrals: number;
    vouchers_issued: number;
    vouchers_redeemed: number;
    vouchers_expired: number;
    total_discounts_issued_kes: string;
    fraud_attempts: number;
    confirmed_fraud: number;
  };
  campaigns: Campaign[];
  topReferrers: Array<{
    user_id: string;
    full_name: string;
    email: string;
    total_shares: number;
    total_signups: number;
    total_completed: number;
    total_vouchers_earned: number;
    total_vouchers_redeemed: number;
    total_savings_kes: string;
  }>;
  fraudSummary: Array<{ fraud_type: string; n: number; confirmed: number; latest: string }>;
  conversionFunnel: {
    codes_generated: number;
    referrals_created: number;
    referrals_completed: number;
    vouchers_issued: number;
    vouchers_redeemed: number;
  };
}

const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "Last year" },
];

export default function ReferralCampaigns() {
  const { toast } = useToast();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.getReferralAnalytics(period)
      .then((d: any) => setData(d))
      .catch(() => toast({ title: "Failed to load analytics", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const updateStatus = async (campaignId: string, status: "active" | "paused" | "disabled") => {
    try {
      await apiClient.updateReferralCampaignStatus(campaignId, status);
      toast({ title: `Campaign ${status}` });
      load();
    } catch (e: any) {
      toast({ title: e.message || "Failed to update campaign", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-400">Loading referral analytics…</div>;
  }

  if (!data) return null;

  const o = data.overview;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referral Campaigns</h1>
          <p className="text-slate-500 text-sm">Manage campaigns, view analytics, review fraud</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card icon={Users} label="Total referrals" value={o.total_referrals} />
        <Card icon={Award} label="Vouchers issued" value={o.vouchers_issued} />
        <Card icon={Gift} label="Vouchers redeemed" value={o.vouchers_redeemed} />
        <Card icon={DollarSign} label="Discounts issued" value={`KES ${Number(o.total_discounts_issued_kes).toLocaleString()}`} />
      </div>

      {/* Conversion funnel */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 mb-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Conversion Funnel
        </h3>
        <div className="grid grid-cols-5 gap-2">
          <FunnelStep label="Codes generated" value={data.conversionFunnel.codes_generated} />
          <FunnelStep label="Referrals created" value={data.conversionFunnel.referrals_created} />
          <FunnelStep label="Referrals completed" value={data.conversionFunnel.referrals_completed} />
          <FunnelStep label="Vouchers issued" value={data.conversionFunnel.vouchers_issued} />
          <FunnelStep label="Vouchers redeemed" value={data.conversionFunnel.vouchers_redeemed} />
        </div>
      </div>

      {/* Campaigns list */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 mb-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Campaigns ({data.campaigns.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-4">Campaign</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Discount</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Issued</th>
                <th className="pb-2 pr-4">Redeemed</th>
                <th className="pb-2 pr-4">Discounts (KES)</th>
                <th className="pb-2 pr-4">Window</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{c.slug}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      c.campaign_type === 'sunday' ? 'bg-purple-100 text-purple-700' :
                      c.campaign_type === 'promo' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>{c.campaign_type}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{c.discount_percentage}%</div>
                    <div className="text-xs text-slate-500">max KES {Number(c.max_discount_kes).toLocaleString()}</div>
                  </td>
                  <td className="py-3 pr-4"><StatusBadge status={c.status} /></td>
                  <td className="py-3 pr-4 text-slate-700">{c.vouchers_issued}</td>
                  <td className="py-3 pr-4 text-slate-700">{c.vouchers_redeemed}</td>
                  <td className="py-3 pr-4 text-slate-700">{Number(c.total_discount_kes).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">
                    {c.start_date ? `${new Date(c.start_date).toLocaleDateString()} → ${new Date(c.end_date || '').toLocaleDateString()}` : 'Always on'}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex gap-1">
                      {c.status === 'active' && (
                        <button onClick={() => updateStatus(c.id, 'paused')} title="Pause" className="p-1.5 rounded hover:bg-amber-100">
                          <Pause className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                      )}
                      {c.status === 'paused' && (
                        <button onClick={() => updateStatus(c.id, 'active')} title="Resume" className="p-1.5 rounded hover:bg-green-100">
                          <Play className="w-3.5 h-3.5 text-green-600" />
                        </button>
                      )}
                      {c.status !== 'disabled' && (
                        <button onClick={() => updateStatus(c.id, 'disabled')} title="Disable" className="p-1.5 rounded hover:bg-red-100">
                          <X className="w-3.5 h-3.5 text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top referrers + fraud */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top referrers */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" /> Top Referrers
          </h3>
          {data.topReferrers.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No referrers yet</p>
          ) : (
            <div className="space-y-2">
              {data.topReferrers.slice(0, 10).map((r, i) => (
                <div key={r.user_id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-200 text-slate-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-50 text-slate-500'
                    }`}>{i + 1}</div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{r.full_name}</div>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">{r.total_vouchers_earned} vouchers</div>
                    <div className="text-xs text-slate-500">{r.total_completed} referrals</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fraud summary */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-500" /> Fraud Summary
          </h3>
          {data.fraudSummary.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No fraud detected 🎉</p>
          ) : (
            <div className="space-y-2">
              {data.fraudSummary.map((f) => (
                <div key={f.fraud_type} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-sm text-slate-700 capitalize">{f.fraud_type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">{f.n} attempts</div>
                    <div className="text-xs text-red-600">{f.confirmed} confirmed</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create campaign modal */}
      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
          creating={creating}
          setCreating={setCreating}
          toast={toast}
        />
      )}
    </div>
  );
}

function Card({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-3 bg-slate-50 rounded-xl">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1 leading-tight">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    disabled: "bg-red-100 text-red-700",
    expired: "bg-slate-100 text-slate-700",
  };
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${map[status] || map.expired}`}>{status}</span>;
}

function CreateCampaignModal({ onClose, onCreated, creating, setCreating, toast }: any) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    campaignType: 'sunday',
    discountPercentage: 3,
    maxDiscountKes: 500,
    voucherValidityDays: 14,
    minJobValueKes: 500,
    startDate: '',
    endDate: '',
    maxRedemptions: 100,
  });

  const submit = async () => {
    if (!form.name || !form.slug) {
      toast({ title: "Name and slug required", variant: "destructive" });
      return;
    }
    if (form.campaignType !== 'standard' && (!form.startDate || !form.endDate)) {
      toast({ title: "Sunday/promo campaigns require start and end dates", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await apiClient.createReferralCampaign(form);
      toast({ title: "Campaign created!" });
      onCreated();
    } catch (e: any) {
      toast({ title: e.message || "Failed to create campaign", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Create Referral Campaign</h3>
        <div className="space-y-3">
          <Field label="Campaign name">
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" />
          </Field>
          <Field label="Slug (URL identifier)">
            <input value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} className="input" placeholder="sunday-5pct-july" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.campaignType} onChange={e => setForm({...form, campaignType: e.target.value})} className="input">
                <option value="sunday">Sunday</option>
                <option value="promo">Promo</option>
                <option value="standard">Standard (always-on)</option>
              </select>
            </Field>
            <Field label="Discount %">
              <input type="number" min="0" max="100" step="0.5" value={form.discountPercentage} onChange={e => setForm({...form, discountPercentage: Number(e.target.value)})} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max discount (KES)">
              <input type="number" min="0" value={form.maxDiscountKes} onChange={e => setForm({...form, maxDiscountKes: Number(e.target.value)})} className="input" />
            </Field>
            <Field label="Voucher validity (days)">
              <input type="number" min="1" value={form.voucherValidityDays} onChange={e => setForm({...form, voucherValidityDays: Number(e.target.value)})} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" value={form.startDate.slice(0,10)} onChange={e => setForm({...form, startDate: e.target.value + 'T00:00:00Z'})} className="input" />
            </Field>
            <Field label="End date">
              <input type="date" value={form.endDate.slice(0,10)} onChange={e => setForm({...form, endDate: e.target.value + 'T23:59:59Z'})} className="input" />
            </Field>
          </div>
          <Field label="Max redemptions (blank = unlimited)">
            <input type="number" min="1" value={form.maxRedemptions} onChange={e => setForm({...form, maxRedemptions: Number(e.target.value)})} className="input" />
          </Field>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={creating} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
        <style>{`.input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem; }`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
