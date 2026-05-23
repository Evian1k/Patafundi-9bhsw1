import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { apiClient } from "@/lib/api";
import { isApiConfigured } from "@/config/env";
import { toast } from "sonner";
import { z } from "zod";
import EnvWarning from "@/components/ui/EnvWarning";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "login"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupStage, setSignupStage] = useState<"form" | "otp">("form");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const routeAfterAuth = useCallback(async () => {
    const meRes = await apiClient.getCurrentUser();
    const me = meRes?.user ?? null;
    if (!me) return navigate("/dashboard");
    const role = String(me.role || "").toLowerCase();
    if (role === "admin") return navigate("/admin/dashboard");
    if (role === "fundi") return navigate("/fundi");
    if (role === "fundi_pending") {
      try {
        const s = await apiClient.getFundiApprovalStatus() as { fundi?: Record<string, unknown> };
        return navigate(s?.fundi ? "/fundi/pending" : "/fundi/register");
      } catch {
        return navigate("/fundi/register");
      }
    }
    return navigate("/dashboard");
  }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const explicitMode = searchParams.get("mode");
    if (token && !explicitMode) {
      routeAfterAuth().catch(() => navigate("/dashboard"));
    }
  }, [navigate, routeAfterAuth, searchParams]);

  // Persist OTP session
  useEffect(() => {
    if (mode !== "signup") return;
    const savedEmail = localStorage.getItem("pending_otp_email");
    const savedPurpose = localStorage.getItem("pending_otp_purpose");
    if (savedEmail && savedPurpose === "register") {
      setPendingEmail(savedEmail);
      setSignupStage("otp");
    }
  }, [mode]);

  // OTP countdown
  useEffect(() => {
    if (signupStage !== "otp" || resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [signupStage, resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const schema = mode === "signup" ? signupSchema : loginSchema;
      const validatedData = schema.parse(formData);

      if (mode === "signup") {
        const reg = await apiClient.register(validatedData.email, validatedData.password, formData.name) as { message?: string };
        setPendingEmail(validatedData.email);
        setSignupStage("otp");
        setResendCooldown(30);
        localStorage.setItem("pending_otp_email", validatedData.email);
        localStorage.setItem("pending_otp_purpose", "register");
        toast.success(reg?.message || "OTP sent! Check your email.");
      } else {
        await apiClient.login(validatedData.email, validatedData.password);
        toast.success("Welcome back!");
        await routeAfterAuth().catch(() => navigate("/dashboard"));
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        const msg = error instanceof Error ? error.message : "Authentication failed";
        if (typeof msg === "string" && msg.toLowerCase().includes("not verified")) {
          const email = formData.email;
          if (email) {
            setMode("signup");
            setPendingEmail(email);
            setSignupStage("otp");
            setOtpCode("");
            setResendCooldown(0);
            localStorage.setItem("pending_otp_email", email);
            localStorage.setItem("pending_otp_purpose", "register");
            toast.error(msg);
            return;
          }
        }
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail) return;
    setLoading(true);
    try {
      await apiClient.otpVerify(pendingEmail, otpCode, "register");
      localStorage.removeItem("pending_otp_email");
      localStorage.removeItem("pending_otp_purpose");
      toast.success("Verified! Welcome to PataFundi.");
      await routeAfterAuth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-3xl p-8 shadow-xl border border-border/50"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
              <span className="text-white font-bold text-xl">P</span>
            </div>
            <h1 className="text-2xl font-display font-bold">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === "login" ? "Sign in to access your account" : "Get started with PataFundi today"}
            </p>
          </div>

          {/* API not configured warning */}
          {!isApiConfigured() && (
            <div className="mb-4">
              <EnvWarning compact />
            </div>
          )}

          {/* OTP Stage */}
          {mode === "signup" && signupStage === "otp" ? (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <p className="text-sm text-muted-foreground text-center">
                Enter the 6-digit code sent to <span className="font-medium text-foreground">{pendingEmail}</span>
              </p>

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button type="submit" className="w-full bg-gradient-primary rounded-xl" disabled={loading || otpCode.length < 6}>
                {loading ? "Verifying..." : "Verify OTP"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={resendCooldown > 0}
                onClick={async () => {
                  if (!pendingEmail) return;
                  try {
                    await apiClient.otpResend(pendingEmail, "register");
                    setResendCooldown(30);
                    toast.success("OTP resent. Check your email.");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to resend OTP");
                  }
                }}
              >
                {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : "Resend OTP"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setSignupStage("form");
                  setOtpCode("");
                  setResendCooldown(0);
                  localStorage.removeItem("pending_otp_email");
                  localStorage.removeItem("pending_otp_purpose");
                }}
              >
                Back
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Your full name"
                      className="w-full h-12 pl-10 pr-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full h-12 pl-10 pr-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full h-12 pl-10 pr-12 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>

              {/* Demo account hint */}
              {mode === "login" && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Demo accounts:</span><br />
                    Customer: <code className="text-primary">demo@patafundi.com</code> / <code className="text-primary">Demo12345</code><br />
                    Fundi: <code className="text-primary">fundi@patafundi.com</code> / <code className="text-primary">Fundi12345</code>
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !isApiConfigured()}
                className="w-full bg-gradient-primary rounded-xl h-12"
              >
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </Button>

              {mode === "signup" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => {
                    try {
                      localStorage.setItem("fundi_prefill", JSON.stringify({ fullName: formData.name, email: formData.email }));
                    } catch {}
                    navigate("/fundi/register");
                  }}
                >
                  Register as Fundi (verification required)
                </Button>
              )}
            </form>
          )}

          {/* Toggle mode */}
          {signupStage === "form" && (
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-primary font-semibold hover:underline"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
