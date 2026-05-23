import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, CheckCircle, XCircle, AlertCircle, Loader2, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import FundiVerificationModal from "./FundiVerificationModal";
import AdminLayout from "@/components/admin/AdminLayout";

interface Fundi {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  idNumber: string;
  idPhotoUrl: string;
  selfieUrl: string;
  verificationStatus: string;
  skills: string[];
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function FundiVerificationManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fundis, setFundis] = useState<Fundi[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [selectedFundi, setSelectedFundi] = useState<Record<string, unknown> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [focusHandled, setFocusHandled] = useState(false);

  const fetchFundis = async (page = 1) => {
    setLoading(true);
    try {
      let endpoint = `/admin/search-fundis?page=${page}&limit=${pagination.limit}`;
      if (searchQuery) endpoint += `&q=${encodeURIComponent(searchQuery)}`;
      if (statusFilter) endpoint += `&status=${statusFilter}`;
      const response = await apiClient.request(endpoint, { includeAuth: true }) as { success?: boolean; fundis?: Fundi[]; pagination?: PaginationInfo };
      if (response?.success) {
        setFundis(response.fundis || []);
        setPagination(response.pagination || { page, limit: 10, total: 0, pages: 1 });
      } else {
        setFundis([]);
        setPagination({ page, limit: 10, total: 0, pages: 1 });
      }
    } catch (error) {
      console.error("Error fetching fundis:", error);
      setFundis([]);
      toast.error("Failed to load fundis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFundis(1); }, [statusFilter]);

  // Handle direct focus link from email
  useEffect(() => {
    if (focusHandled) return;
    const focusId = searchParams.get("focus");
    if (!focusId) { setFocusHandled(true); return; }
    (async () => {
      try {
        const response = await apiClient.request(`/admin/fundis/${focusId}`, { includeAuth: true }) as { fundi?: Record<string, unknown> };
        if (response?.fundi) { setSelectedFundi(response.fundi); setShowModal(true); }
      } catch { /* ignore */ } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("focus");
        setSearchParams(next, { replace: true });
        setFocusHandled(true);
      }
    })();
  }, [focusHandled, searchParams]);

  const handleOpenModal = async (fundi: Fundi) => {
    try {
      const response = await apiClient.request(`/admin/fundis/${fundi.id}`, { includeAuth: true }) as { fundi?: Record<string, unknown> };
      setSelectedFundi(response.fundi || null);
      setShowModal(true);
    } catch {
      toast.error("Failed to load fundi details");
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
      approved: "bg-green-100 text-green-800 border-green-300",
      rejected: "bg-red-100 text-red-800 border-red-300",
      suspended: "bg-orange-100 text-orange-800 border-orange-300",
    };
    return map[status] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  const getStatusIcon = (status: string) => {
    if (status === "pending") return <AlertCircle className="w-4 h-4" />;
    if (status === "approved") return <CheckCircle className="w-4 h-4" />;
    if (status === "rejected") return <XCircle className="w-4 h-4" />;
    if (status === "suspended") return <AlertCircle className="w-4 h-4" />;
    return null;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fundi Verification</h1>
            <p className="text-muted-foreground text-sm">Review and manage fundi registrations</p>
          </div>
          <Button onClick={() => fetchFundis(pagination.page)} variant="outline" size="sm">Refresh</Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); fetchFundis(1); }} className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, ID…" className="pl-10" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border rounded-lg bg-white text-sm">
              <option value="pending">Pending Verification</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="">All Statuses</option>
            </select>
            <Button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</Button>
          </form>
        </Card>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading fundis...
          </div>
        ) : fundis.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="font-semibold text-lg mb-1">No {statusFilter} Fundis</p>
            <p className="text-muted-foreground text-sm">All fundis have been processed!</p>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {fundis.map((fundi) => (
                <motion.div key={fundi.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="p-4 hover:shadow-md transition-all cursor-pointer" onClick={() => handleOpenModal(fundi)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0">
                        {fundi.firstName?.[0]}{fundi.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{fundi.firstName} {fundi.lastName}</p>
                        <p className="text-sm text-muted-foreground">{fundi.email}</p>
                        <p className="text-xs text-muted-foreground">ID: {fundi.idNumber}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {fundi.skills?.slice(0, 2).map((skill) => (
                          <span key={skill} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">{skill}</span>
                        ))}
                        {fundi.skills?.length > 2 && <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">+{fundi.skills.length - 2}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${getStatusColor(fundi.verificationStatus)}`}>
                          {getStatusIcon(fundi.verificationStatus)}
                          {fundi.verificationStatus.charAt(0).toUpperCase() + fundi.verificationStatus.slice(1)}
                        </span>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleOpenModal(fundi); }}>
                          <Eye className="w-3 h-3 mr-1" />Review
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchFundis(pagination.page - 1)} disabled={pagination.page === 1 || loading}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => fetchFundis(pagination.page + 1)} disabled={pagination.page === pagination.pages || loading}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && selectedFundi && (
        <FundiVerificationModal fundi={selectedFundi} onClose={() => { setShowModal(false); fetchFundis(pagination.page); }} />
      )}
    </AdminLayout>
  );
}
