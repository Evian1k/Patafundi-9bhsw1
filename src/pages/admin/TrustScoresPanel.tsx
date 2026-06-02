/**
 * Admin Trust Scores Panel — full-page trust score management.
 * Shows all users (customers + fundis) with trust tiers, history, and manual adjustment.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Award, Search, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Shield, AlertTriangle,
  Loader2, User, Filter, Edit3, Check, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import TrustBadge, { getTrustLevel } from "@/components/ui/TrustBadge";

interface TrustUser {
  userId: string;
  userName: string;
  email?: string;
  role: "customer" | "fundi";
  score: number;
  previousScore?: number;
  completionRate?: number;
  cancellationRate?: number;
  disputeCount?: number;
  successfulPayments?: number;
  bypassAttempts?: number;
  fraudRiskLevel?: "low" | "medium" | "high" | "critical";
  flags?: string[];
  lastActivity?: string;
  joinedAt?: string;
}

const RISK_COLORS = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const TIER_FILTER_OPTIONS = ["All", "Elite", "Trusted", "Verified", "Risky", "Unrated"];

export default function TrustScoresPanel() {
  const [users, setUsers] = useState<TrustUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState<"all" | "customer" | "fundi">("all");
  const [selected, setSelected] = useState<TrustUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [editScore, setEditScore] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"score_asc" | "score_desc" | "risk" | "recent">("risk");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getTrustScores(page, 20) as {
        scores?: TrustUser[];
        total?: number;
        pages?: number;
      };
      setUsers(res.scores ?? []);
      if (res.pages) setTotalPages(res.pages);
    } catch (e) {
      console.error("[TrustScores]", e);
      toast.error("Failed to load trust scores");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchScores(); }, [fetchScores]);

  const handleAdjustScore = async () => {
    if (!selected) return;
    const newScore = parseInt(editScore);
    if (isNaN(newScore) || newScore < 0 || newScore > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      await apiClient.request(`/admin/trust-scores/${selected.userId}/adjust`, {
        method: "POST",
        body: JSON.stringify({ score: newScore, note: editNote }),
        includeAuth: true,
      });
      toast.success(`Trust score updated to ${newScore}`);
      setEditing(false);
      setEditScore("");
      setEditNote("");
      fetchScores();
      // Update local state
      setSelected((prev) => prev ? { ...prev, score: newScore, previousScore: prev.score } : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update score");
    } finally {
      setSaving(false);
    }
  };

  // Filter + sort
  const filtered = users
    .filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (tierFilter !== "All" && getTrustLevel(u.score) !== tierFilter.toLowerCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        return u.userName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "score_asc") return a.score - b.score;
      if (sortBy === "score_desc") return b.score - a.score;
      if (sortBy === "risk") {
        const r = { critical: 0, high: 1, medium: 2, low: 3 };
        return (r[a.fraudRiskLevel ?? "low"] ?? 3) - (r[b.fraudRiskLevel ?? "low"] ?? 3);
      }
      return 0;
    });

  // Summary stats
  const elite = users.filter((u) => u.score >= 90).length;
  const trusted = users.filter((u) => u.score >= 70 && u.score < 90).length;
  const risky = users.filter((u) => u.score < 50).length;
  const critical = users.filter((u) => u.fraudRiskLevel === "critical" || u.fraudRiskLevel === "high").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-6 h-6 text-amber-500" />
              Trust Score Management
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Monitor, review, and adjust user trust ratings</p>
          </div>
          <Button onClick={fetchScores} disabled={loading} variant="outline" size="sm" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Elite Users", value: elite, color: "text-amber-700 bg-amber-50 border-amber-200", icon: Award },
            { label: "Trusted", value: trusted, color: "text-green-700 bg-green-50 border-green-200", icon: Shield },
            { label: "Risky", value: risky, color: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
            { label: "High Risk", value: critical, color: "text-red-900 bg-red-100 border-red-300", icon: AlertTriangle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium opacity-70">{label}</p>
                <Icon className="w-3.5 h-3.5 opacity-60" />
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9"
            />
          </div>

          {/* Tier filter */}
          <div className="flex gap-1.5 flex-wrap">
            {TIER_FILTER_OPTIONS.map((tier) => (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  tierFilter === tier
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="px-3 py-1.5 rounded-xl text-xs border border-gray-200 bg-white"
          >
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="fundi">Fundis</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 rounded-xl text-xs border border-gray-200 bg-white"
          >
            <option value="risk">Sort: Risk Level</option>
            <option value="score_asc">Sort: Score ↑</option>
            <option value="score_desc">Sort: Score ↓</option>
          </select>
        </div>

        {/* Main content */}
        <div className={`grid gap-6 ${selected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Table */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-gray-500">Loading trust data...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">No users match your filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((user, i) => {
                  const level = getTrustLevel(user.score);
                  const delta = user.previousScore != null ? user.score - user.previousScore : null;
                  return (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card
                        className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                          selected?.userId === user.userId ? "ring-2 ring-primary border-primary" : ""
                        }`}
                        onClick={() => {
                          setSelected(user);
                          setEditing(false);
                          setEditScore(String(user.score));
                          setEditNote("");
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm truncate">{user.userName}</p>
                              <TrustBadge score={user.score} size="sm" />
                              {user.fraudRiskLevel && user.fraudRiskLevel !== "low" && (
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${RISK_COLORS[user.fraudRiskLevel]}`}>
                                  {user.fraudRiskLevel} risk
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 capitalize">
                              {user.role} {user.email && `• ${user.email}`}
                            </p>
                            {user.flags && user.flags.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-1">
                                {user.flags.slice(0, 3).map((f) => (
                                  <span key={f} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded">
                                    {f}
                                  </span>
                                ))}
                                {user.flags.length > 3 && (
                                  <span className="text-[10px] text-gray-400">+{user.flags.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Score */}
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1 justify-end">
                              {delta != null && (
                                delta > 0
                                  ? <TrendingUp className="w-3 h-3 text-green-500" />
                                  : <TrendingDown className="w-3 h-3 text-red-500" />
                              )}
                              <span className={`text-2xl font-bold ${
                                level === "elite" ? "text-amber-600" :
                                level === "trusted" ? "text-green-600" :
                                level === "verified" ? "text-blue-600" :
                                "text-red-600"
                              }`}>
                                {user.score}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400">/100</p>
                          </div>
                        </div>

                        {/* Score bar */}
                        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              user.score >= 90 ? "bg-amber-400" :
                              user.score >= 70 ? "bg-green-500" :
                              user.score >= 50 ? "bg-blue-500" :
                              "bg-red-500"
                            }`}
                            style={{ width: `${user.score}%` }}
                          />
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                {/* Header */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">User Details</h3>
                    <button
                      onClick={() => setSelected(null)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <User className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-base">{selected.userName}</p>
                      {selected.email && <p className="text-sm text-gray-500">{selected.email}</p>}
                      <p className="text-xs text-gray-400 capitalize">{selected.role}</p>
                      <div className="mt-2">
                        <TrustBadge score={selected.score} size="md" showScore />
                      </div>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: "Completion Rate",
                        value: selected.completionRate != null ? `${selected.completionRate}%` : "—",
                        good: (selected.completionRate ?? 0) >= 80,
                      },
                      {
                        label: "Cancellation Rate",
                        value: selected.cancellationRate != null ? `${selected.cancellationRate}%` : "—",
                        good: (selected.cancellationRate ?? 0) <= 10,
                      },
                      {
                        label: "Disputes",
                        value: selected.disputeCount ?? "—",
                        good: (selected.disputeCount ?? 0) === 0,
                      },
                      {
                        label: "Bypass Attempts",
                        value: selected.bypassAttempts ?? "—",
                        good: (selected.bypassAttempts ?? 0) === 0,
                      },
                      {
                        label: "Successful Payments",
                        value: selected.successfulPayments ?? "—",
                        good: true,
                      },
                      {
                        label: "Fraud Risk",
                        value: selected.fraudRiskLevel ?? "—",
                        good: selected.fraudRiskLevel === "low" || !selected.fraudRiskLevel,
                      },
                    ].map(({ label, value, good }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                        <p className={`font-bold text-sm capitalize ${good ? "text-gray-800" : "text-red-600"}`}>
                          {String(value)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Flags */}
                  {selected.flags && selected.flags.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Active Flags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.flags.map((f) => (
                          <span key={f} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Score adjustment */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-gray-400" />
                      <h4 className="font-semibold text-sm">Adjust Trust Score</h4>
                    </div>
                    {!editing && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(true);
                          setEditScore(String(selected.score));
                        }}
                        className="gap-1.5 text-xs"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </Button>
                    )}
                  </div>

                  {!editing ? (
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">Current Score</span>
                          <span className="font-bold text-2xl">{selected.score}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              selected.score >= 90 ? "bg-amber-400" :
                              selected.score >= 70 ? "bg-green-500" :
                              selected.score >= 50 ? "bg-blue-500" : "bg-red-500"
                            }`}
                            style={{ width: `${selected.score}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>0 (Risky)</span>
                          <span>100 (Elite)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">New Score (0–100)</label>
                        <Input
                          type="number"
                          value={editScore}
                          onChange={(e) => setEditScore(e.target.value)}
                          min={0}
                          max={100}
                          className="text-center text-lg font-bold"
                        />
                        {editScore && (
                          <p className="text-xs text-center mt-1 text-gray-500">
                            Will be: <TrustBadge score={parseInt(editScore)} size="sm" className="inline-flex" />
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1.5">
                          Note <span className="text-gray-400 font-normal">(reason for change)</span>
                        </label>
                        <Input
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="e.g. Resolved bypass attempt, completed verification..."
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-primary gap-2"
                          onClick={handleAdjustScore}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditing(false)}
                          className="gap-2"
                        >
                          <X className="w-4 h-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Quick actions */}
                <Card className="p-5">
                  <h4 className="font-semibold text-sm mb-3">Quick Actions</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start gap-2"
                      onClick={async () => {
                        try {
                          await apiClient.request(`/admin/users/${selected.userId}/force-logout`, { method: "POST", includeAuth: true });
                          toast.success("User logged out");
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                      }}
                    >
                      <Filter className="w-3.5 h-3.5" /> Force Logout
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start gap-2 text-orange-600 hover:text-orange-700 border-orange-200"
                      onClick={async () => {
                        const newScore = Math.max(0, selected.score - 10);
                        setEditScore(String(newScore));
                        setEditing(true);
                      }}
                    >
                      <TrendingDown className="w-3.5 h-3.5" /> Deduct 10 pts
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start gap-2 text-green-600 hover:text-green-700 border-green-200"
                      onClick={() => {
                        const newScore = Math.min(100, selected.score + 10);
                        setEditScore(String(newScore));
                        setEditing(true);
                      }}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> Add 10 pts
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start gap-2 text-red-600 hover:text-red-700 border-red-200"
                      onClick={async () => {
                        try {
                          await apiClient.request(`/admin/users/${selected.userId}/disable`, { method: "POST", includeAuth: true });
                          toast.success("Account disabled");
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                      }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> Disable Account
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AdminLayout>
  );
}
