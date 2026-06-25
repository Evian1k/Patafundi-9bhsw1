import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiClient } from "@/lib/api";
import { bootstrapAuthSessionFromUser } from "@/lib/authSession";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, ShieldCheck } from "lucide-react";

export default function FundiPendingApproval() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    approvalStatus?: string;
    message?: string;
    role?: string;
    emailVerified?: boolean;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      navigate("/register/fundi");
      return;
    }
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        bootstrapAuthSessionFromUser(me?.user);
        const res = await apiClient.getFundiOnboardingStatus() as { onboarding?: Record<string, unknown> };
        const o = res.onboarding || {};
        setStatus({
          approvalStatus: String(o.approvalStatus || "pending"),
          message: String(o.message || "Your account is under review."),
          role: String(o.role || ""),
          emailVerified: Boolean(o.emailVerified),
        });
        if (o.approvalStatus === "approved" && o.role === "fundi") {
          navigate("/fundi");
        }
      } catch {
        navigate("/register/fundi");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const approved = status?.approvalStatus === "approved";
  const rejected = status?.approvalStatus === "rejected";

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border p-8 text-center space-y-4">
        {rejected ? <XCircle className="w-14 h-14 text-red-500 mx-auto" /> : approved ? <CheckCircle className="w-14 h-14 text-green-600 mx-auto" /> : <Clock className="w-14 h-14 text-yellow-500 mx-auto" />}
        <h1 className="text-xl font-bold">{rejected ? "Application Rejected" : approved ? "Approved" : "Under Review"}</h1>
        <p className="text-sm text-muted-foreground">{status?.message || "Your account is under review."}</p>
        {!rejected && !approved && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            An admin is verifying your ID and selfie documents.
          </div>
        )}
        {rejected && (
          <Button asChild className="w-full"><Link to="/register/fundi">Re-register</Link></Button>
        )}
        {!approved && !rejected && (
          <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>Sign in with another account</Button>
        )}
      </div>
    </div>
  );
}
