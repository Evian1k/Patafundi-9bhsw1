import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Loader2, Mail, Lock, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { BrandLogo } from "@/assets/logo";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Check if already authenticated as admin
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (token) {
          const response = await apiClient.getCurrentUser();
          if (response.user?.role === "admin") {
            navigate("/admin/dashboard", { replace: true });
            return;
          }
          // Token exists but not admin — clear it
          localStorage.removeItem("auth_token");
        }
      } catch {
        localStorage.removeItem("auth_token");
      } finally {
        setCheckingSession(false);
      }
    })();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.login(email, password) as { user?: { role?: string } };

      if (!response.user) {
        throw new Error("Login failed — no user returned.");
      }

      if (response.user.role !== "admin") {
        // Clear the token — non-admin should not persist
        apiClient.setToken(null);
        throw new Error("Access denied. This account does not have admin privileges.");
      }

      toast.success("Admin login successful!");
      navigate("/admin/dashboard", { replace: true });
    } catch (err: unknown) {
      const errorMessage = (err instanceof Error ? err.message : null) || "Login failed";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo size="md" linkTo={false} />
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Card className="bg-slate-900 border-slate-700 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <BrandLogo size="lg" linkTo={false} className="justify-center mb-4" />
            <h1 className="text-white text-2xl font-display font-bold">Admin Access</h1>
            <p className="text-slate-400 text-sm mt-1">PataFundi Management Panel</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-xl mb-5">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-slate-300 text-sm">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@patafundi.com"
                  className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-primary"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-300 text-sm">Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-primary"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" />Sign In</>
              )}
            </Button>
          </form>

          {/* Security notice */}
          <div className="mt-6 p-3 bg-slate-800 rounded-xl">
            <p className="text-slate-400 text-xs text-center">
              Restricted area. All access attempts are logged.
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
