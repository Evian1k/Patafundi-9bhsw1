/**
 * Staff Management Center — super_admin only.
 * Create, edit, suspend, activate, assign roles, assign permissions.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Ban, Check, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { useModalA11y } from "@/lib/a11y";
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
  const roleDialogRef = useModalA11y(Boolean(selected), () => setSelected(null));
  const [newRole, setNewRole] = useState("");

  // Create-staff dialog (backend: POST /admin/staff via rbac.createStaff)
  const [showCreate, setShowCreate] = useState(false);
  const createDialogRef = useModalA11y(showCreate, () => setShowCreate(false));
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState("support_agent");
  const [createPassword, setCreatePassword] = useState("");
  const [creating, setCreating] = useState(false);

  const generatePassword = () => {
    // Readable password: word-number-word-symbol - meets backend complexity.
    const words = ["fundi", "pata", "kazi", "harambee", "haraka", "salama"];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    setCreatePassword(`${pick()}-${Math.floor(100 + Math.random() * 900)}-${pick()}!`);
  };

  const createStaff = async () => {
    if (!createEmail || !createName || !createPassword) {
      toast.error("Email, full name, and password are required");
      return;
    }
    setCreating(true);
    try {
      await apiClient.request("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          email: createEmail,
          fullName: createName,
          phone: createPhone || undefined,
          role: createRole,
          password: createPassword,
        }),
        includeAuth: true,
      });
      toast.success(`Staff account created for ${createName}`);
      setShowCreate(false);
      setCreateEmail(""); setCreateName(""); setCreatePhone(""); setCreatePassword("");
      fetchStaff();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create staff");
    } finally {
      setCreating(false);
    }
  };

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
        // Backend route: POST /admin/customers/:id/unblock (shared user unblock)
        await apiClient.request(`/admin/customers/${userId}/unblock`, { method: "POST", includeAuth: true });
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
            <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
            <p className="text-muted-foreground text-sm mt-1">Create, manage, and assign roles to staff accounts</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Create Staff
            </Button>
            <Button variant="outline" size="sm" onClick={fetchStaff} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </motion.div>

        {/* Staff table */}
        <motion.div variants={fadeUp} className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/60">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No staff found</td></tr>
                ) : (
                  staff.map((member) => (
                    <tr key={member.id} className="border-b border-border/40 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">{member.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
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
                            className="p-1.5 text-muted-foreground hover:text-blue-600 rounded-lg hover:bg-blue-500/10"
                            title="Change role"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleStatus(member.id, member.status)}
                            className="p-1.5 text-muted-foreground hover:text-amber-600 rounded-lg hover:bg-amber-500/10"
                            title={member.status === "active" ? "Disable" : "Activate"}
                          >
                            {member.status === "active" ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => forceLogout(member.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-500/10"
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
            <div ref={roleDialogRef} role="dialog" aria-modal="true" aria-label={`Change role for ${selected.full_name}`} tabIndex={-1} className="bg-card rounded-2xl p-6 max-w-md w-full focus:outline-none" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-foreground mb-4">Change Role: {selected.full_name}</h3>
              <p className="text-sm text-muted-foreground mb-4">Current role: <strong className="capitalize">{selected.role.replace(/_/g, " ")}</strong></p>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-4 py-2 border border-border bg-card rounded-xl mb-4"
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

        {/* Create staff modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div ref={createDialogRef} role="dialog" aria-modal="true" aria-label="Create staff account" tabIndex={-1} className="bg-card rounded-2xl p-6 max-w-md w-full focus:outline-none max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-foreground mb-1">Create Staff Account</h3>
              <p className="text-sm text-muted-foreground mb-4">The new staff member can sign in immediately with these credentials.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Full Name *</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Jane Wanjiku"
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email *</label>
                  <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="jane@patafundi.com"
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Phone (optional)</label>
                  <input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} placeholder="07xx xxx xxx"
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Role</label>
                  <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg mt-1">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Temporary Password *</label>
                  <div className="flex gap-2 mt-1">
                    <input value={createPassword} onChange={(e) => setCreatePassword(e.target.value)}
                      className="flex-1 px-3 py-2 border border-border bg-card rounded-lg font-mono text-sm" />
                    <Button type="button" variant="outline" size="sm" onClick={generatePassword}>Generate</Button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <Button className="flex-1" onClick={createStaff} disabled={creating}>
                  <UserPlus className="w-4 h-4 mr-2" /> {creating ? "Creating…" : "Create Account"}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
              <p className="text-xs text-amber-600 mt-3">
                ⚠️ Share the password securely and ask the staff member to change it after first sign-in.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
