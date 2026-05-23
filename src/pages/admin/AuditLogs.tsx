import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Loader2, Search, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface AuditLog {
  id: string;
  adminId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, pages: 1 });

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      let endpoint = `/admin/action-logs?page=${page}&limit=${pagination.limit}`;
      if (searchQuery) endpoint += `&q=${encodeURIComponent(searchQuery)}`;
      if (actionFilter) endpoint += `&actionType=${actionFilter}`;
      const response = await apiClient.request(endpoint, { includeAuth: true }) as { logs?: AuditLog[]; pagination?: PaginationInfo };
      setLogs(response.logs || []);
      setPagination(response.pagination || { page, limit: 50, total: 0, pages: 1 });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(1); }, []);

  const handleExportLogs = () => {
    try {
      const csv = [
        ["ID", "Action", "Target", "Target ID", "Reason", "Timestamp"],
        ...logs.map((log) => [log.id, log.actionType, log.targetType, log.targetId, log.reason || "", new Date(log.createdAt).toISOString()]),
      ].map((row) => row.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Logs exported successfully");
    } catch {
      toast.error("Failed to export logs");
    }
  };

  const getActionColor = (action: string) => {
    const map: Record<string, string> = {
      approve: "bg-green-100 text-green-800",
      activate: "bg-green-100 text-green-800",
      reject: "bg-red-100 text-red-800",
      disable: "bg-red-100 text-red-800",
      suspend: "bg-orange-100 text-orange-800",
      block: "bg-red-100 text-red-800",
      force_logout: "bg-red-100 text-red-800",
    };
    return map[action] || "bg-blue-100 text-blue-800";
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audit Logs</h1>
            <p className="text-muted-foreground text-sm">View all admin actions and system events</p>
          </div>
          <Button variant="outline" onClick={handleExportLogs}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); fetchLogs(1); }} className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs…" className="pl-10" />
            </div>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-4 py-2 border rounded-lg bg-white text-sm">
              <option value="">All Actions</option>
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
              <option value="suspend">Suspend</option>
              <option value="block">Block</option>
              <option value="force_logout">Force Logout</option>
              <option value="disable">Disable</option>
            </select>
            <Button type="submit" disabled={loading}>{loading ? "Searching..." : "Filter Logs"}</Button>
          </form>
        </Card>

        {/* Logs Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-lg mb-1">No Logs Found</p>
            <p className="text-muted-foreground text-sm">{searchQuery ? "Try adjusting your search criteria" : "No audit logs available"}</p>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["Action", "Target", "Target ID", "Reason", "Timestamp"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.actionType)}`}>
                            {log.actionType.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">{log.targetType}</td>
                        <td className="px-4 py-3 font-mono text-xs">{log.targetId.substring(0, 12)}…</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-48 truncate">{log.reason || "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages} (Total: {pagination.total} logs)</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchLogs(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1 || loading}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => fetchLogs(Math.min(pagination.pages, pagination.page + 1))} disabled={pagination.page === pagination.pages || loading}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
