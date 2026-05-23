import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, CheckCircle, XCircle, ShieldCheck } from "lucide-react";

export default function FundiPendingApproval() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState("");

  const canSubmitOtp = useMemo(() => otp.trim().length >= 4, [otp]);

  const load = async () => {
    setStatusLoading(true);
    try {
      const userRes = await apiClient.getCurrentUser();
      const user = userRes?.user;
      if (!user) throw new Error("Not authenticated");
      setEmail((user.email as string) || "");

      const s = await apiClient.getFundiApprovalStatus() as {
        fundi?: Record<string, unknown>;
        gates?: Record<string, unknown>;
        user?: Record<string, unknown>;
      };
      setVerificationStatus((s?.fundi?.verificationStatus as string) ?? null);
      setOtpRequired(Boolean(s?.gates?.otpRequired));

      if (s?.gates?.isApproved && !s?.gates?.otpRequired) {
        navigate("/fundi");
      }
    } catch {
      localStorage.removeItem("auth_token");
      navigate("/auth");
    } finally {
      setStatusLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { navigate("/auth"); return; }
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [navigate]);

  const handleVerifyOtp = async () => {
    try {
      if (!email) throw new Error("Missing email");
      const r = await apiClient.otpVerify(email, otp, "fundi_approval") as { token?: string };
      if (r?.token) {
        toast.success("OTP verified. Welcome!");
        navigate("/fundi");
      } else {
        toast.success("OTP verified");
        navigate("/fundi");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OTP verification failed");
    }
  };

  const handleResend = async () => {
    try {
      if (!email) throw new Error("Missing email");
      await apiClient.otpResend(email, "fundi_approval");
      toast.success("OTP resent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend OTP");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const status = (verificationStatus || "pending").toLowerCase();

  const statusIcon = {
    approved: <CheckCircle className="w-12 h-12 text-green-500" />,
    rejected: <XCircle className="w-12 h-12 text-red-500" />,
    pending: <Clock className="w-12 h-12 text-yellow-500" />,
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl p-8 shadow-xl border border-border/50 text-center space-y-6">
          <div className="flex justify-center">
            {statusIcon[status as keyof typeof statusIcon] || statusIcon.pending}
          </div>

          <div>
            <h1 className="text-2xl font-display font-bold mb-2">Review & Approval</h1>
            <p className="text-muted-foreground text-sm">
              Your documents were submitted. Please wait while our team reviews them.
            </p>
          </div>

          <div className="p-4 bg-muted rounded-2xl">
            <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Current status</p>
            <p className={`font-bold text-lg capitalize ${
              status === "approved" ? "text-green-600" : status === "rejected" ? "text-red-600" : "text-yellow-600"
            }`}>
              {status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Under Review"}
            </p>
            {statusLoading && <p className="text-xs text-muted-foreground mt-1">Updating…</p>}
          </div>

          {status === "rejected" && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                Your verification was rejected. Please contact support or re-register with correct documents.
              </p>
              <Button variant="outline" onClick={() => navigate("/fundi/register")} className="w-full">
                Try Again
              </Button>
            </div>
          )}

          {otpRequired && status === "approved" && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-2xl border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-green-800 text-sm">Account Approved!</p>
                </div>
                <p className="text-xs text-green-700">Enter the OTP sent to your email to access your fundi dashboard.</p>
              </div>
              <input
                type="number"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                placeholder="Enter OTP"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex gap-3">
                <Button className="flex-1 bg-gradient-primary" onClick={handleVerifyOtp} disabled={!canSubmitOtp}>
                  Verify OTP
                </Button>
                <Button variant="outline" onClick={handleResend}>Resend</Button>
              </div>
            </div>
          )}

          {!otpRequired && status !== "rejected" && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>Home</Button>
              <Button className="flex-1" onClick={load}>Refresh</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
