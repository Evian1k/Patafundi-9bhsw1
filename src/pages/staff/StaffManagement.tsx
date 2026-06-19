/**
 * Staff Management Center — super_admin only.
 * Create, edit, suspend, activate, assign roles, assign permissions.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Shield, UserPlus, Ban, Check, Key, LogOut, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: string;
  trust_score: number;
  created_at: string;
}

const ROLES = [
  { value: "admin", label: "Admin (Ops Manager)" },
  { value: "support_agent", label: "Support Agent" },
  { value: "fraud_analyst", label: "Fraud Analyst" },
  { value: "finance_team", label: "Finance Team" },
  { value: "dispatch_team", label: "Dispatch Team" },
  { value: "devops_engineer", label: "DevOps Engineer" },
  { value: "auditor", label: "Auditor (Read-Only)" },
];

export default function StaffManagement() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [newRole, setNewRole] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.request("/admin/staff", { includeAuth: true }) as { staff: StaffMember[] };
      setStaff(data.staff || []);
    } catch {
      toast.error("Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        if (me?.user?.role !== "super_admin") {
          navigate("/staff");
          return;
        }
      } catch {
        navigate("/staff/login");
        return;
      }
      fetchStaff();
    })();
  }, [navigate, fetchStaff]);

  const changeRole = async (userId: string, role: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
        includeAuth: true,
      });
      toast.success(`Role changed to ${role}`);
      fetchStaff();
      setSelected(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to change role");
    }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    try {
      if (currentStatus === "active") {
        await apiClient.request(`/admin/users/${userId}/disable`, { method: "POST", includeAuth: true });
        toast.success("Staff member disabled");
      } else {
        await apiClient.request(`/admin/users/${userId}/unblock`, { method: "POST", includeAuth: true });
        toast.success("Staff member activated");
      }
      fetchStaff();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const forceLogout = async (userId: string) => {
    try {
      await apiClient.request(`/admin/users/${userId}/force-logout`, { method: "POST", includeAuth: true });
      toast.success("Force logout sent");
    } catch {
      toast.error("Failed");
    }
  };

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
            <p className="text-slate-500 text-sm mt-1">Create, manage, and assign roles to staff accounts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStaff} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </motion.div>

        {/* Staff table */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No staff found</td></tr>
                ) : (
                  staff.map((member) => (
                    <tr key={member.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{member.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{member.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                          {member.role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          member.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setSelected(member); setNewRole(member.role); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                            title="Change role"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleStatus(member.id, member.status)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50"
                            title={member.status === "active" ? "Disable" : "Activate"}
                          >
                            {member.status === "active" ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => forceLogout(member.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            title="Force logout"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Role change modal */}
        {selected && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">Change Role: {selected.full_name}</h3>
              <p className="text-sm text-slate-500 mb-4">Current role: <strong className="capitalize">{selected.role.replace(/_/g, " ")}</strong></p>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl mb-4"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => changeRole(selected.id, newRole)}>
                  <Shield className="w-4 h-4 mr-2" /> Confirm Role Change
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              </div>
              <p className="text-xs text-amber-600 mt-3">
                ⚠️ The user will be force-logged out and must re-authenticate with their new role.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
