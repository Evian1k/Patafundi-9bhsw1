import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Search, Mail, Phone, Loader2, MoreVertical, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface Customer {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  jobCount: number;
  createdAt: string;
  status?: string | null;
  emailVerified?: boolean;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function CustomerManagement() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCustomers = async (page = 1) => {
    setLoading(true);
    try {
      let endpoint = `/admin/customers?page=${page}&limit=${pagination.limit}`;
      if (searchQuery) endpoint += `&q=${encodeURIComponent(searchQuery)}`;
      const response = await apiClient.request(endpoint, { includeAuth: true }) as { success?: boolean; customers?: Customer[]; pagination?: PaginationInfo };
      if (response?.success) {
        setCustomers(response.customers || []);
        setPagination(response.pagination || { page, limit: 10, total: 0, pages: 1 });
      } else {
        setCustomers([]);
        setPagination({ page, limit: 10, total: 0, pages: 1 });
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      const msg = error instanceof Error ? error.message : "";
      if (msg.toLowerCase().includes("access denied") || msg.toLowerCase().includes("authentication required") || msg.toLowerCase().includes("invalid or expired token")) {
        localStorage.removeItem("auth_token");
        toast.error("Admin session expired. Please sign in again.");
        navigate("/admin/login");
        return;
      }
      setCustomers([]);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(1);
    const id = window.setInterval(() => fetchCustomers(pagination.page), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleBlockUnblock = async (customer: Customer) => {
    const isBlocked = customer.status === "blocked" || customer.status === "disabled";
    setActionLoading(customer.id);
    try {
      await apiClient.request(`/admin/customers/${customer.id}/${isBlocked ? "unblock" : "block"}`, { method: "POST", includeAuth: true });
      toast.success(`Customer ${isBlocked ? "unblocked" : "blocked"} successfully`);
      fetchCustomers(pagination.page);
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update customer");
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customer Management</h1>
            <p className="text-muted-foreground text-sm">View and manage platform customers</p>
          </div>
          <div className="px-4 py-2 bg-primary/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Total Customers</span>
            <p className="font-bold text-primary">{pagination.total}</p>
          </div>
        </div>

        {/* Search */}
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); fetchCustomers(1); }} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email…" className="pl-10" />
            </div>
            <Button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</Button>
          </form>
        </Card>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="font-semibold text-lg mb-1">No Customers Found</p>
            <p className="text-muted-foreground text-sm">{searchQuery ? "Try adjusting your search criteria" : "No customers registered yet"}</p>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {customers.map((customer) => (
                <motion.div key={customer.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 shrink-0">
                        {(customer.fullName || customer.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{customer.fullName || customer.email}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</span>
                          {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{customer.jobCount} jobs</span>
                          {typeof customer.emailVerified === "boolean" && (
                            <span className={`px-1.5 py-0.5 rounded-full ${customer.emailVerified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {customer.emailVerified ? "verified" : "unverified"}
                            </span>
                          )}
                          {customer.status && customer.status !== "active" && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{customer.status}</span>
                          )}
                          <span>Joined {formatDate(customer.createdAt)}</span>
                        </div>
                      </div>
                      <div className="relative">
                        <button onClick={() => setOpenMenu(openMenu === customer.id ? null : customer.id)} className="p-2 hover:bg-gray-100 rounded transition">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenu === customer.id && (
                          <div className="absolute right-0 top-8 bg-white border rounded-xl shadow-lg z-10 min-w-36">
                            <button
                              onClick={() => handleBlockUnblock(customer)}
                              disabled={actionLoading === customer.id}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 disabled:opacity-50"
                            >
                              {actionLoading === customer.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                              {customer.status === "blocked" || customer.status === "disabled" ? "Unblock" : "Block"} Customer
                            </button>
                          </div>
                        )}
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
                  <Button variant="outline" size="sm" onClick={() => fetchCustomers(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1 || loading}>Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => fetchCustomers(Math.min(pagination.pages, pagination.page + 1))} disabled={pagination.page === pagination.pages || loading}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
