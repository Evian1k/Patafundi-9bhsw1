/**
 * Staff Login Portal — /staff/login
 *
 * Dedicated login for internal staff only. Customer and fundi accounts
 * are rejected with a clear message. After login, staff are routed to
 * their role-specific dashboard:
 *
 *   super_admin      → /staff/executive
 *   admin            → /staff/operations
 *   support_agent    → /staff/support
 *   fraud_analyst    → /staff/fraud
 *   finance_team     → /staff/finance
 *   dispatch_team    → /staff/dispatch
 *   devops_engineer  → /staff/devops
 *   auditor          → /staff/audit
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, LogIn, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useReducedMotion, fadeUp } from "@/lib/motion";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

const STAFF_ROUTES: Record<string, string> = {
  super_admin: "/staff/executive",
  admin: "/staff/operations",
  support_agent: "/staff/support",
  fraud_analyst: "/staff/fraud",
  finance_team: "/staff/finance",
  dispatch_team: "/staff/dispatch",
  devops_engineer: "/staff/devops",
  auditor: "/staff/audit",
};

const STAFF_ROLES = Object.keys(STAFF_ROUTES);

export default function StaffLogin() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiClient.login(email, password) as {
        success?: boolean;
        message?: string;
        user?: { role?: string };
      };

      if (!data.success) {
        setError(data.message || "Login failed");
        return;
      }

      const role = data.user?.role || "";

      // Reject non-staff accounts
      if (!STAFF_ROLES.includes(role)) {
        await apiClient.logout();
        setError(
          role === "customer"
            ? "This portal is for staff only. Customers should use the main login."
            : role === "fundi" || role === "fundi_pending"
            ? "This portal is for staff only. Fundis should use the fundi dashboard."
            : "Access denied. This account does not have staff privileges."
        );
        return;
      }

      toast.success("Welcome to the staff portal");
      navigate(STAFF_ROUTES[role] || "/staff");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <motion.div
        initial={reduceMotion ? {} : "hidden"}
        animate="visible"
        variants={fadeUp}
        className="w-full max-w-md"
      >
        <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Staff Portal</h1>
            <p className="text-slate-400 text-sm">
              Internal access only. Sign in with your staff account.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Staff Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@patafundi.com"
                required
                disabled={loading}
                autoComplete="email"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 text-white rounded-xl placeholder:text-slate-500 focus:border-primary focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 text-white rounded-xl placeholder:text-slate-500 focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-primary hover:bg-primary/90 rounded-xl h-11"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Sign in to Staff Portal
                </span>
              )}
            </Button>
          </form>

          {/* Demo accounts hint */}
          {import.meta.env.DEV && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <p className="text-xs text-slate-500 mb-2 text-center">Staff demo accounts:</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400">
                <div>admin@patafundi.com / Admin@2024!</div>
                <div>support@patafundi.com / Support@2024!</div>
                <div>fraud@patafundi.com / Fraud@2024!</div>
                <div>finance@patafundi.com / Finance@2024!</div>
                <div>dispatch@patafundi.com / Dispatch@2024!</div>
                <div>devops@patafundi.com / Devops@2024!</div>
                <div>auditor@patafundi.com / Auditor@2024!</div>
                <div>ops@patafundi.com / Ops@2024!</div>
              </div>
              <div className="mt-3 text-center">
                <Link to="/demo" className="text-xs text-primary hover:underline">
                  View all demo accounts →
                </Link>
              </div>
            </div>
          )}

          {/* Back to main site */}
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to main site
            </Link>
          </div>
        </div>

        {/* Branding */}
        <div className="mt-6 text-center">
          <BrandLogo size="sm" />
          <p className="mt-2 text-[10px] text-slate-600">
            PataFundi Staff Portal · Authorized personnel only
          </p>
        </div>
      </motion.div>
    </div>
  );
}
