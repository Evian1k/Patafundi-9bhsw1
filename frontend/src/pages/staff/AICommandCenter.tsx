/**
 * AI Command Center — /staff/ai
 *
 * Super_admin only. The AI is advisory — it NEVER performs actions.
 * It analyzes data and generates recommendations that super_admin
 * must review and act on manually.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Brain, AlertTriangle, TrendingUp, DollarSign, Shield, Users,
  Activity, RefreshCw, CheckCircle, XCircle, Eye, Sparkles,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AIRecommendation {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface AIDashboard {
  pending: { total: number; critical: number; high: number };
  stats: { total: number; actioned: number; dismissed: number; reviewed: number };
  byCategory: Array<{ category: string; count: number; pending: number }>;
  recent: AIRecommendation[];
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  fundi_verification: Shield,
  fraud_detection: AlertTriangle,
  revenue: DollarSign,
  commission: TrendingUp,
  platform_health: Activity,
  growth: Users,
  staff_performance: Users,
  customer_experience: Brain,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
  info: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function AICommandCenter() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [dashboard, setDashboard] = useState<AIDashboard | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [role, setRole] = useState("");
  const [filter, setFilter] = useState<string>("pending");

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") {
          navigate("/staff");
          return;
        }
        setRole(me.user.role);
      } catch {
        navigate("/staff/login");
      }
    })();
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.request("/ai/dashboard", { includeAuth: true }) as AIDashboard;
      setDashboard(data);
      const recs = await apiClient.request(`/ai/recommendations?status=${filter}`, { includeAuth: true }) as { recommendations: AIRecommendation[] };
      setRecommendations(recs.recommendations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (role === "super_admin") fetchData();
  }, [role, fetchData]);

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const result = await apiClient.request("/ai/run", { method: "POST", includeAuth: true }) as { totalRecommendations: number };
      toast.success(`AI analysis complete — ${result.totalRecommendations} recommendations generated`);
      fetchData();
    } catch {
      toast.error("AI analysis failed");
    } finally {
      setRunning(false);
    }
  };

  const reviewRec = async (id: string, action: "reviewed" | "dismissed" | "actioned") => {
    try {
      await apiClient.request(`/ai/recommendations/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
        includeAuth: true,
      });
      toast.success(`Marked as ${action}`);
      fetchData();
    } catch {
      toast.error("Failed to update recommendation");
    }
  };

  if (role !== "super_admin") {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Verifying access…</div>;
  }

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">AI Command Center</h1>
              <p className="text-slate-500 text-sm">Advisory only — AI recommends, super_admin decides</p>
            </div>
          </div>
          <Button onClick={runAnalysis} disabled={running}>
            <Sparkles className={`w-4 h-4 mr-2 ${running ? "animate-pulse" : ""}`} />
            {running ? "Analyzing…" : "Run AI Analysis"}
          </Button>
        </motion.div>

        {/* AI Safety Notice */}
        <motion.div variants={fadeUp} className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>AI Safety:</strong> The AI can analyze data and generate recommendations but <strong>cannot perform any actions</strong>.
            It cannot approve fundis, suspend users, modify payments, release escrow, or change commissions.
            All actions require super_admin approval.
          </div>
        </motion.div>

        {/* Stats */}
        {dashboard && (
          <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-slate-900">{dashboard.pending?.total || 0}</div>
              <div className="text-xs text-slate-500">Pending Recommendations</div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-red-600">{dashboard.pending?.critical || 0}</div>
              <div className="text-xs text-slate-500">Critical Alerts</div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-orange-600">{dashboard.pending?.high || 0}</div>
              <div className="text-xs text-slate-500">High Priority</div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-emerald-600">{dashboard.stats?.actioned || 0}</div>
              <div className="text-xs text-slate-500">Actions Taken</div>
            </div>
          </motion.div>
        )}

        {/* Category breakdown */}
        {dashboard && dashboard.byCategory?.length > 0 && (
          <motion.div variants={fadeUp} className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {dashboard.byCategory.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.category] || Activity;
              return (
                <button
                  key={cat.category}
                  onClick={() => setFilter(cat.category === filter ? "pending" : cat.category)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    filter === cat.category ? "bg-primary/10 border-primary" : "bg-white border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4 text-slate-600 mb-1" />
                  <div className="text-sm font-medium text-slate-900 capitalize">{cat.category.replace(/_/g, " ")}</div>
                  <div className="text-xs text-slate-500">{cat.pending} pending / {cat.count} total</div>
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Recommendations */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recommendations</h2>
            <div className="flex gap-2">
              {["pending", "reviewed", "dismissed", "actioned"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === s ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading recommendations…</div>
          ) : recommendations.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              No recommendations in this category. Run AI analysis to generate new insights.
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => {
                const Icon = CATEGORY_ICONS[rec.category] || Activity;
                const severityClass = SEVERITY_COLORS[rec.severity] || SEVERITY_COLORS.info;
                return (
                  <div key={rec.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{rec.title}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${severityClass}`}>
                            {rec.severity}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            {rec.confidence}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{rec.description}</p>
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                          <p className="text-sm text-slate-700">
                            <strong className="text-primary">AI recommends:</strong> {rec.recommendation}
                          </p>
                        </div>
                        {rec.status === "pending" && (
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" variant="outline" onClick={() => reviewRec(rec.id, "reviewed")}>
                              <Eye className="w-3 h-3 mr-1" /> Mark Reviewed
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => reviewRec(rec.id, "actioned")}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Action Taken
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reviewRec(rec.id, "dismissed")}>
                              <XCircle className="w-3 h-3 mr-1" /> Dismiss
                            </Button>
                          </div>
                        )}
                        {rec.status !== "pending" && (
                          <div className="text-xs text-slate-400 mt-2 capitalize">
                            Status: {rec.status}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
