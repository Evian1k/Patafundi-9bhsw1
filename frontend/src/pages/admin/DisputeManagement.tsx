import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale, Search, CheckCircle, Clock, AlertOctagon,
  Loader2, RefreshCw, AlertTriangle, DollarSign,
  Upload, X, Image, ChevronDown, ChevronUp,
  Lightbulb, MessageSquare, Calendar, User,
  ShieldAlert, Gavel, BadgeCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { realtimeService } from "@/services/realtime";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import TrustBadge from "@/components/ui/TrustBadge";

type DisputeStatus = "open" | "investigating" | "customer_won" | "fundi_won" | "resolved" | "escalated";

interface TimelineEntry {
  id: string;
  action: string;
  actor: string;
  actorRole: "customer" | "fundi" | "admin" | "system";
  timestamp: string;
  note?: string;
}

interface Evidence {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  uploadedBy: string;
  uploadedAt: string;
}

interface Dispute {
  id: string;
  jobId: string;
  customerName: string;
  customerTrustScore?: number;
  fundiName: string;
  fundiTrustScore?: number;
  reason: string;
  status: DisputeStatus;
  amount?: number;
  createdAt: string;
  updatedAt?: string;
  resolution?: string;
  timeline?: TimelineEntry[];
  evidence?: Evidence[];
  disputeType?: string;
}

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: "bg-yellow-100 text-yellow-800 border-yellow-200",
  investigating: "bg-blue-100 text-blue-800 border-blue-200",
  customer_won: "bg-green-100 text-green-800 border-green-200",
  fundi_won: "bg-purple-100 text-purple-800 border-purple-200",
  resolved: "bg-gray-100 text-gray-800 border-gray-200",
  escalated: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_ICONS: Record<DisputeStatus, React.ElementType> = {
  open: AlertTriangle,
  investigating: Search,
  customer_won: BadgeCheck,
  fundi_won: BadgeCheck,
  resolved: CheckCircle,
  escalated: ShieldAlert,
};

/**
 * Auto-generate resolution suggestions based on dispute type/reason.
 */
function getResolutionSuggestions(reason: string, disputeType?: string): string[] {
  const lower = (reason + " " + (disputeType ?? "")).toLowerCase();
  if (lower.includes("incomplete") || lower.includes("not finish")) {
    return [
      "Issue partial refund (50%) to customer — work was started but not completed.",
      "Ask fundi to return and complete the job within 24 hours or full refund applies.",
      "Mark as customer_won and release escrow back to customer.",
    ];
  }
  if (lower.includes("quality") || lower.includes("poor work") || lower.includes("bad")) {
    return [
      "Request photographic evidence from both parties before ruling.",
      "Issue partial refund (25%) as goodwill and mark resolved.",
      "Assign a platform inspector to verify work quality — escalate if needed.",
    ];
  }
  if (lower.includes("no show") || lower.includes("didn't arrive") || lower.includes("late")) {
    return [
      "Full refund to customer — fundi did not fulfil service obligation.",
      "Strike against fundi profile for reliability failure.",
      "Mark as customer_won and block fundi from accepting for 48 hours.",
    ];
  }
  if (lower.includes("overcharge") || lower.includes("price") || lower.includes("amount")) {
    return [
      "Review agreed estimated price vs final amount charged.",
      "Refund the difference if fundi overcharged without prior agreement.",
      "Issue warning to fundi for price discrepancy.",
    ];
  }
  if (lower.includes("damage") || lower.includes("broke") || lower.includes("property")) {
    return [
      "Escalate for full admin review — property damage claims require evidence.",
      "Freeze fundi earnings pending investigation.",
      "Issue full refund + compensation depending on documented damage.",
    ];
  }
  if (lower.includes("bypass") || lower.includes("cash") || lower.includes("direct")) {
    return [
      "Apply platform bypass penalty to both parties.",
      "Warn customer and reduce fundi trust score.",
      "Issue formal strike — second offense triggers suspension.",
    ];
  }
  return [
    "Request additional evidence from both parties.",
    "Arrange a mediation chat between customer and fundi.",
    "Apply standard resolution based on job completion status.",
  ];
}

export default function AdminDisputeManagement() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [resolving, setResolving] = useState(false);
  const [newBadgeCount, setNewBadgeCount] = useState(0);
  const [expandedTimeline, setExpandedTimeline] = useState(true);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getAdminDisputes(1, statusFilter || undefined) as {
        disputes?: Dispute[];
      };
      setDisputes(res.disputes || []);
      setNewBadgeCount(0);
    } catch (e) {
      console.error("[AdminDisputes]", e);
      toast.error("Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  // Real-time: listen for new disputes
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) realtimeService.connect(token);

    const onNewDispute = (payload: Record<string, unknown>) => {
      setNewBadgeCount((n) => n + 1);
      toast("New dispute opened", {
        description: `${String(payload?.customerName ?? "A customer")} filed a dispute`,
        action: { label: "View", onClick: () => { fetchDisputes(); setStatusFilter("open"); } },
      });
    };

    realtimeService.on("dispute:opened", onNewDispute);
    return () => { realtimeService.off("dispute:opened", onNewDispute); };
  }, [fetchDisputes]);

  const handleResolve = async (outcome: "customer_won" | "fundi_won" | "resolved") => {
    if (!selected) return;
    if (!resolution.trim()) { toast.error("Please enter a resolution note"); return; }
    setResolving(true);
    try {
      await apiClient.resolveDispute(
        selected.id,
        `${outcome}: ${resolution}`,
        refundAmount ? parseFloat(refundAmount) : undefined,
      );
      toast.success("Dispute resolved successfully");
      setSelected(null);
      setResolution("");
      setRefundAmount("");
      setEvidenceFiles([]);
      fetchDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setResolving(false);
    }
  };

  const handleUploadEvidence = async () => {
    if (!selected || evidenceFiles.length === 0) return;
    setUploadingEvidence(true);
    try {
      const formData = new FormData();
      evidenceFiles.forEach((f) => formData.append("evidence", f));
      await apiClient.uploadDisputeEvidence(selected.id, formData);
      toast.success(`${evidenceFiles.length} file(s) uploaded`);
      setEvidenceFiles([]);
      fetchDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setEvidenceFiles((prev) => [...prev, ...files].slice(0, 5));
    e.target.value = "";
  };

  const filtered = disputes.filter((d) =>
    searchQuery
      ? d.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.fundiName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.jobId?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const openCount = disputes.filter((d) => d.status === "open" || d.status === "escalated").length;
  const suggestions = selected ? getResolutionSuggestions(selected.reason, selected.disputeType) : [];

  // Build a mock timeline if none returned from API
  const getTimeline = (d: Dispute): TimelineEntry[] => {
    if (d.timeline && d.timeline.length > 0) return d.timeline;
    const entries: TimelineEntry[] = [
      {
        id: "1",
        action: "Dispute opened",
        actor: d.customerName,
        actorRole: "customer",
        timestamp: d.createdAt,
        note: d.reason,
      },
    ];
    if (d.status === "investigating") {
      entries.push({
        id: "2",
        action: "Under investigation",
        actor: "Admin",
        actorRole: "admin",
        timestamp: d.updatedAt || d.createdAt,
        note: "Admin assigned for review",
      });
    }
    if (d.resolution) {
      entries.push({
        id: "3",
        action: `Resolved: ${d.status.replace("_", " ")}`,
        actor: "Admin",
        actorRole: "admin",
        timestamp: d.updatedAt || d.createdAt,
        note: d.resolution,
      });
    }
    return entries;
  };

  const timelineIconMap: Record<string, React.ElementType> = {
    customer: User,
    fundi: User,
    admin: Gavel,
    system: Clock,
  };

  const timelineColorMap: Record<string, string> = {
    customer: "bg-blue-100 text-blue-600",
    fundi: "bg-purple-100 text-purple-600",
    admin: "bg-primary/10 text-primary",
    system: "bg-gray-100 text-gray-500",
  };

  return (
    <AdminLayout disputeBadge={newBadgeCount > 0 ? newBadgeCount : undefined}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="w-6 h-6 text-primary" />
              Dispute Center
              {newBadgeCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold animate-bounce">
                  {newBadgeCount}
                </span>
              )}
            </h1>
            <p className="text-gray-500 text-sm">Review, investigate, and resolve customer/fundi disputes</p>
          </div>
          <div className="flex items-center gap-2">
            {openCount > 0 && (
              <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-xl text-sm font-medium">
                {openCount} need attention
              </span>
            )}
            <Button onClick={fetchDisputes} disabled={loading} variant="outline" size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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
                placeholder="Search by customer, fundi, or job ID..."
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

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open", count: disputes.filter((d) => d.status === "open").length, color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
            { label: "Investigating", count: disputes.filter((d) => d.status === "investigating").length, color: "text-blue-700 bg-blue-50 border-blue-200" },
            { label: "Escalated", count: disputes.filter((d) => d.status === "escalated").length, color: "text-red-700 bg-red-50 border-red-200" },
          ].map(({ label, count, color }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Main layout */}
        <div className={`grid gap-6 ${selected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
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
                  {statusFilter === "open" ? "All disputes have been resolved." : "Try adjusting your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((dispute, i) => {
                  const color = STATUS_COLORS[dispute.status] || STATUS_COLORS.open;
                  const StatusIcon = STATUS_ICONS[dispute.status] || AlertTriangle;
                  return (
                    <motion.div
                      key={dispute.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Card
                        className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                          selected?.id === dispute.id ? "ring-2 ring-primary border-primary" : ""
                        }`}
                        onClick={() => {
                          setSelected(dispute);
                          setResolution("");
                          setRefundAmount("");
                          setEvidenceFiles([]);
                          setShowSuggestions(true);
                          setExpandedTimeline(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <StatusIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <p className="font-semibold text-sm truncate">
                                {dispute.customerName} vs {dispute.fundiName}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dispute.reason}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {dispute.customerTrustScore != null && (
                                <TrustBadge score={dispute.customerTrustScore} size="sm" />
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(dispute.createdAt).toLocaleDateString("en-KE")}
                              </span>
                              {dispute.amount && (
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <DollarSign className="w-3 h-3" />
                                  KES {dispute.amount.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${color}`}>
                            {dispute.status.replace("_", " ")}
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
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
                {/* Dispute header card */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">Dispute Details</h3>
                    <button
                      onClick={() => setSelected(null)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Customer</p>
                      <p className="font-semibold text-sm">{selected.customerName}</p>
                      {selected.customerTrustScore != null && (
                        <TrustBadge score={selected.customerTrustScore} size="sm" showScore className="mt-1" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Fundi</p>
                      <p className="font-semibold text-sm">{selected.fundiName}</p>
                      {selected.fundiTrustScore != null && (
                        <TrustBadge score={selected.fundiTrustScore} size="sm" showScore className="mt-1" />
                      )}
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-0.5">Reason</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selected.reason}</p>
                  </div>

                  {selected.amount != null && (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                      <span className="text-sm text-gray-600">Escrow Amount</span>
                      <span className="font-bold text-primary text-lg">
                        KES {selected.amount.toLocaleString()}
                      </span>
                    </div>
                  )}
                </Card>

                {/* Timeline */}
                <Card className="p-5">
                  <button
                    className="w-full flex items-center justify-between mb-0"
                    onClick={() => setExpandedTimeline((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <h4 className="font-semibold text-sm">Dispute Timeline</h4>
                    </div>
                    {expandedTimeline
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </button>
                  <AnimatePresence>
                    {expandedTimeline && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-4 relative">
                          {/* Vertical line */}
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" />
                          {getTimeline(selected).map((entry, idx) => {
                            const Icon = timelineIconMap[entry.actorRole] || Clock;
                            const iconColor = timelineColorMap[entry.actorRole] || "bg-gray-100 text-gray-400";
                            return (
                              <div key={entry.id || idx} className="flex gap-3 relative">
                                <div className={`w-8 h-8 rounded-full ${iconColor} flex items-center justify-center shrink-0 z-10 border-2 border-white`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 pt-1 pb-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{entry.action}</p>
                                      <p className="text-xs text-gray-500">by {entry.actor}</p>
                                    </div>
                                    <span className="text-xs text-gray-400 shrink-0">
                                      {new Date(entry.timestamp).toLocaleString("en-KE", {
                                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  {entry.note && (
                                    <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded-lg px-3 py-2">
                                      {entry.note}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>

                {/* Evidence */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Image className="w-4 h-4 text-gray-400" />
                    <h4 className="font-semibold text-sm">Evidence</h4>
                  </div>

                  {/* Existing evidence */}
                  {selected.evidence && selected.evidence.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {selected.evidence.map((ev) => (
                        <a
                          key={ev.id}
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={ev.url}
                            alt="Evidence"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=File";
                            }}
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Upload area */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Upload evidence photos/documents</p>
                    <p className="text-xs text-gray-400">Max 5 files · JPG, PNG, PDF</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                  />

                  {evidenceFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {evidenceFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-xs text-gray-700 truncate">{f.name}</span>
                          <button
                            onClick={() => setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="ml-2 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleUploadEvidence}
                        disabled={uploadingEvidence}
                        className="w-full gap-2"
                      >
                        {uploadingEvidence
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Upload className="w-4 h-4" />
                        }
                        Upload {evidenceFiles.length} file{evidenceFiles.length > 1 ? "s" : ""}
                      </Button>
                    </div>
                  )}
                </Card>

                {/* AI Suggestions */}
                {suggestions.length > 0 && (
                  <Card className="p-5 border-amber-200 bg-amber-50">
                    <button
                      className="w-full flex items-center justify-between"
                      onClick={() => setShowSuggestions((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <h4 className="font-semibold text-sm text-amber-800">Resolution Suggestions</h4>
                      </div>
                      {showSuggestions
                        ? <ChevronUp className="w-4 h-4 text-amber-500" />
                        : <ChevronDown className="w-4 h-4 text-amber-500" />
                      }
                    </button>
                    <AnimatePresence>
                      {showSuggestions && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-2">
                            {suggestions.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => setResolution(s)}
                                className="w-full text-left text-xs text-amber-800 bg-white border border-amber-200 rounded-lg p-3 hover:bg-amber-100 transition-colors"
                              >
                                <span className="font-semibold text-amber-600 mr-1">{i + 1}.</span>
                                {s}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-amber-600 mt-2">Click a suggestion to apply it to the resolution notes</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                )}

                {/* Resolution panel */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Gavel className="w-4 h-4 text-gray-400" />
                    <h4 className="font-semibold text-sm">Resolve Dispute</h4>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Resolution Notes *</label>
                      <textarea
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Document your resolution decision..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Refund Amount (KES)
                        <span className="text-gray-400 font-normal ml-1">optional</span>
                      </label>
                      <Input
                        type="number"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder={selected.amount ? `Max KES ${selected.amount.toLocaleString()}` : "0"}
                        min={0}
                        max={selected.amount}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <Button
                        onClick={() => handleResolve("customer_won")}
                        disabled={resolving}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-xs h-10"
                      >
                        {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Customer Won"}
                      </Button>
                      <Button
                        onClick={() => handleResolve("fundi_won")}
                        disabled={resolving}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-10"
                      >
                        {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Fundi Won"}
                      </Button>
                      <Button
                        onClick={() => handleResolve("resolved")}
                        disabled={resolving}
                        variant="outline"
                        size="sm"
                        className="text-xs h-10"
                      >
                        {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Resolve"}
                      </Button>
                    </div>
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
