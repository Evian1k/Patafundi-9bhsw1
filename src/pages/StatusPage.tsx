/**
 * Status Page — public system status
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { CheckCircle, XCircle, AlertTriangle, Activity } from "lucide-react";

export default function StatusPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.request("/health", { includeAuth: false }).catch(() => null)
      .then((d) => setHealth(d))
      .finally(() => setLoading(false));
    const interval = setInterval(() => {
      apiClient.request("/health", { includeAuth: false }).catch(() => null)
        .then((d) => setHealth(d));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const services = [
    { name: "API Server", status: health?.status === "healthy" ? "operational" : "down" },
    { name: "Database", status: health?.subsystems?.database?.ok ? "operational" : "down" },
    { name: "File Storage", status: health?.subsystems?.storage?.provider ? "operational" : "degraded" },
    { name: "Email Service", status: health?.subsystems?.email?.configured ? "operational" : "degraded" },
    { name: "M-Pesa Payments", status: health?.subsystems?.mpesa?.configured ? "operational" : "degraded" },
  ];

  const allOperational = services.every(s => s.status === "operational");

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">System Status</h1>
        <p className="text-slate-500 text-sm mb-8">Real-time platform health — updated every 30 seconds</p>

        <div className={`rounded-2xl p-6 mb-6 ${allOperational ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
          <div className="flex items-center gap-3">
            {allOperational ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            )}
            <div>
              <div className="text-lg font-bold text-slate-900">
                {allOperational ? "All Systems Operational" : "Some Systems Degraded"}
              </div>
              <div className="text-sm text-slate-500">
                {loading ? "Checking status..." : `Last checked: ${new Date().toLocaleTimeString()}`}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
          {services.map(s => (
            <div key={s.name} className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-slate-700">{s.name}</span>
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                s.status === "operational" ? "bg-green-100 text-green-700" :
                s.status === "degraded" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>
                {s.status === "operational" ? <CheckCircle className="w-3 h-3" /> :
                 s.status === "degraded" ? <AlertTriangle className="w-3 h-3" /> :
                 <XCircle className="w-3 h-3" />}
                {s.status === "operational" ? "Operational" : s.status === "degraded" ? "Degraded" : "Down"}
              </span>
            </div>
          ))}
        </div>

        {health && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Server Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Uptime:</span> <span className="font-medium">{Math.floor(health.uptimeSeconds / 60)}m {Math.floor(health.uptimeSeconds % 60)}s</span></div>
              <div><span className="text-slate-500">Environment:</span> <span className="font-medium">{health.build?.env || "unknown"}</span></div>
              <div><span className="text-slate-500">Version:</span> <span className="font-mono text-xs">{health.build?.sha?.substring(0, 8) || "local"}</span></div>
              <div><span className="text-slate-500">DB Mode:</span> <span className="font-medium">{health.subsystems?.database?.mode || "unknown"}</span></div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          Scheduled maintenance: Every Wednesday 2:00 AM - 4:00 AM EAT
        </p>
      </div>
    </div>
  );
}
