import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Clock, DollarSign, Loader2, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { sanitizeLocationText, LOCATION_FALLBACK } from "@/lib/maps/geocoding";
import AdminLayout from "@/components/admin/AdminLayout";

interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  customerId: string;
  customerName: string;
  fundiId: string | null;
  fundiName: string | null;
  estimatedPrice: number;
  finalPrice: number;
  location: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  matching: "bg-blue-100 text-blue-800 border-blue-300",
  accepted: "bg-purple-100 text-purple-800 border-purple-300",
  in_progress: "bg-cyan-100 text-cyan-800 border-cyan-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  disputed: "bg-orange-100 text-orange-800 border-orange-300",
};

export default function JobManagement() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 1 });

  const fetchJobs = async (page = 1) => {
    setLoading(true);
    try {
      let endpoint = `/admin/jobs?page=${page}&limit=${pagination.limit}`;
      if (searchQuery) endpoint += `&q=${encodeURIComponent(searchQuery)}`;
      if (statusFilter) endpoint += `&status=${statusFilter}`;
      const response = await apiClient.request(endpoint, { includeAuth: true }) as { success?: boolean; jobs?: Job[]; pagination?: PaginationInfo };
      if (response?.success) {
        setJobs(response.jobs || []);
        setPagination(response.pagination || { page, limit: 10, total: 0, pages: 1 });
      } else {
        setJobs([]);
        setPagination({ page, limit: 10, total: 0, pages: 1 });
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setJobs([]);
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    const interval = setInterval(() => fetchJobs(pagination.page), 15000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount || 0);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Job Monitoring</h1>
            <p className="text-muted-foreground text-sm">View and monitor all jobs on the platform</p>
          </div>
          <div className="px-4 py-2 bg-orange-50 rounded-lg">
            <span className="text-xs text-muted-foreground">Total Jobs</span>
            <p className="font-bold text-orange-600">{pagination.total}</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); fetchJobs(1); }} className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search jobs…" className="pl-10" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border rounded-lg bg-white text-sm">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="matching">Matching</option>
              <option value="accepted">Accepted</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="disputed">Disputed</option>
            </select>
            <Button type="submit" disabled={loading}>
              <Filter className="w-4 h-4 mr-2" />
              {loading ? "Searching..." : "Filter Jobs"}
            </Button>
          </form>
        </Card>

        {/* Jobs List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Loading jobs...
          </div>
        ) : jobs.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="font-semibold text-lg mb-1">No Jobs Found</p>
            <p className="text-muted-foreground text-sm">{searchQuery ? "Try adjusting your search criteria" : "No jobs available"}</p>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {jobs.map((job) => (
                <motion.div key={job.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">{job.title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_COLORS[job.status] || "bg-gray-100 text-gray-800"}`}>
                            {job.status.replace("_", " ").toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{job.description}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><p className="text-muted-foreground uppercase mb-0.5">Category</p><p className="font-medium">{job.category}</p></div>
                      <div><p className="text-muted-foreground uppercase mb-0.5">Customer</p><p className="font-medium truncate">{job.customerName}</p></div>
                      <div><p className="text-muted-foreground uppercase mb-0.5">Fundi</p><p className="font-medium truncate">{job.fundiName || "Unassigned"}</p></div>
                      <div><p className="text-muted-foreground uppercase mb-0.5">Price</p><p className="font-medium text-primary">{formatCurrency(job.finalPrice > 0 ? job.finalPrice : job.estimatedPrice)}</p></div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground border-t pt-3">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{sanitizeLocationText(job.location, LOCATION_FALLBACK)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(job.createdAt)}</span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchJobs(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1 || loading}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => fetchJobs(Math.min(pagination.pages, pagination.page + 1))} disabled={pagination.page === pagination.pages || loading}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
