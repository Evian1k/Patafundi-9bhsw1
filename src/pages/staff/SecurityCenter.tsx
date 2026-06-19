/**
 * Security Center — 2FA, sessions, login history.
 * Super admin + staff can manage their own security.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Smartphone, Monitor, LogOut, Key, Clock, Copy, Check, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp, stagger } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SecurityCenter() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiClient.getCurrentUser() as any;
      setEnabled(me?.user?.totp_enabled || false);
      const [sess, hist] = await Promise.all([
        apiClient.request("/security/sessions", { includeAuth: true }) as any,
        apiClient.request("/security/login-history", { includeAuth: true }) as any,
      ]);
      setSessions(sess.sessions || []);
      setHistory(hist.history || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiClient.getCurrentUser();
        const staff = ["super_admin","admin","support_agent","fraud_analyst","finance_team","dispatch_team","devops_engineer","auditor"];
        if (!staff.includes(me?.user?.role || "")) { navigate("/dashboard"); return; }
      } catch { navigate("/auth"); return; }
      fetchData();
    })();
  }, [navigate, fetchData]);

  const setup2FA = async () => {
    try {
      const data = await apiClient.request("/security/2fa/setup", { method: "POST", includeAuth: true }) as any;
      setQrCode(data.qrCode);
      setSecret(data.secret);
    } catch { toast.error("Failed to start 2FA setup"); }
  };

  const verify2FA = async () => {
    try {
      const data = await apiClient.request("/security/2fa/verify", {
        method: "POST", body: JSON.stringify({ token: verifyToken }), includeAuth: true,
      }) as any;
      if (data.recoveryCodes) {
        setRecoveryCodes(data.recoveryCodes);
        setEnabled(true);
        setQrCode(null);
        setSecret(null);
        setVerifyToken("");
        toast.success("2FA enabled! Save your recovery codes.");
      }
    } catch { toast.error("Invalid code. Try again."); }
  };

  const disable2FA = async () => {
    try {
      await apiClient.request("/security/2fa/disable", { method: "POST", includeAuth: true });
      setEnabled(false);
      setRecoveryCodes(null);
      toast.success("2FA disabled");
    } catch { toast.error("Failed to disable"); }
  };

  const terminateSession = async (id: string) => {
    try {
      await apiClient.request(`/security/sessions/${id}`, { method: "DELETE", includeAuth: true });
      setSessions(sessions.filter(s => s.id !== id));
      toast.success("Session terminated");
    } catch { toast.error("Failed"); }
  };

  const containerVariants = reduceMotion ? {} : stagger;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={fadeUp} className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Security Center</h1>
          <p className="text-slate-500 text-sm mt-1">Manage 2FA, active sessions, and login history</p>
        </motion.div>

        {/* 2FA Section */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-slate-900">Two-Factor Authentication (TOTP)</h2>
            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${enabled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          {!enabled && !qrCode && (
            <Button onClick={setup2FA}><Smartphone className="w-4 h-4 mr-2" /> Set Up 2FA</Button>
          )}

          {qrCode && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Scan this QR code with Google Authenticator, Authy, or any TOTP app:</p>
              <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-xl border border-slate-200" />
              <p className="text-xs text-slate-400">Or enter manually: <code className="bg-slate-100 px-2 py-0.5 rounded">{secret}</code></p>
              <div className="flex gap-2">
                <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="Enter 6-digit code" maxLength={6}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-center font-mono text-lg tracking-widest" />
                <Button onClick={verify2FA}>Verify & Enable</Button>
              </div>
            </div>
          )}

          {enabled && (
            <div className="space-y-3">
              <p className="text-sm text-green-600">✓ 2FA is active. You'll need a code from your authenticator app to log in.</p>
              <Button variant="outline" onClick={disable2FA}>Disable 2FA</Button>
            </div>
          )}

          {recoveryCodes && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Save these recovery codes — you won't see them again:</p>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="bg-white px-2 py-1 rounded text-sm font-mono">{code}</code>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Active Sessions */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Active Sessions</h2>
          </div>
          {loading ? <p className="text-slate-400 text-sm">Loading…</p> : sessions.length === 0 ? (
            <p className="text-slate-400 text-sm">No active sessions</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Monitor className="w-4 h-4 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{s.token_hash?.slice(0, 16)}…</div>
                    <div className="text-xs text-slate-500">Expires: {new Date(s.expires_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => terminateSession(s.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Login History */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Login History</h2>
          </div>
          {loading ? <p className="text-slate-400 text-sm">Loading…</p> : history.length === 0 ? (
            <p className="text-slate-400 text-sm">No login history</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">IP</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">User Agent</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map(h => (
                    <tr key={h.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 text-slate-600">{h.ip_address || "—"}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{h.user_agent || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {h.success ? "Success" : "Failed"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
