import { useState, useEffect } from "react";
import { Undo2, Loader2, RefreshCw, BadgeCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface RefundRequest {
  id: string;
  job_id: string;
  service_category?: string;
  customer_name?: string;
  customer_email?: string;
  amount: string | number;
  reason: string;
  details?: string | null;
  status: string;
  review_notes?: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-500/10 text-amber-600",
  approved: "bg-blue-500/10 text-blue-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-red-500/10 text-red-600",
};

export default function AdminRefunds() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.adminListRefundRequests(statusFilter) as { refundRequests?: RefundRequest[] };
      setRequests(res.refundRequests || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load refund requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const decide = async (id: string, action: "approve" | "reject") => {
    if (action === "approve" && !window.confirm("Approve this refund? This executes the real ledger reversal (wallet debit / settlement void) and cannot be undone.")) return;
    setActing(id);
    try {
      await apiClient.adminDecideRefundRequest(id, action, { notes: notes[id] || undefined });
      toast.success(action === "approve" ? "Refund approved - reversal executed." : "Refund request declined.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Refund Requests</h1>
            <p className="text-sm text-muted-foreground">
              Customer refund requests. Approval executes the atomic ledger reversal - money movement is always real and audited.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", "requested", "completed", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading refund requests…
          </div>
        ) : requests.length === 0 ? (
          <Card className="p-10 text-center">
            <Undo2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">No refund requests here</p>
            <p className="text-sm text-muted-foreground">Requests appear when customers ask for their money back on a paid job.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">KES {Number(r.amount).toLocaleString()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] || "bg-muted"}`}>{r.status}</span>
                      <span className="text-xs text-muted-foreground">{r.service_category || "job"} · {r.job_id.slice(0, 8)}</span>
                    </div>
                    <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {r.reason}</p>
                    {r.details && <p className="text-xs text-muted-foreground">{r.details}</p>}
                    <p className="text-xs text-muted-foreground">{r.customer_name || r.customer_email || ""} · {new Date(r.created_at).toLocaleString()}</p>
                    {r.review_notes && <p className="text-xs text-muted-foreground">Notes: {r.review_notes}</p>}
                  </div>
                  {r.status === "requested" && (
                    <div className="flex flex-col gap-2 min-w-52">
                      <Input
                        placeholder="Decision note (optional)"
                        value={notes[r.id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" disabled={acting === r.id} onClick={() => decide(r.id, "approve")}>
                          {acting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-1" />}Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" disabled={acting === r.id} onClick={() => decide(r.id, "reject")}>
                          <XCircle className="w-4 h-4 mr-1" />Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
