/**
 * Support Dashboard — Super Admin + Support Agent + Ops Manager
 * Top cards: Open Tickets, Resolved Tickets, Escalated Tickets, SLA Breaches
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Ticket, CheckCircle, AlertCircle, Clock } from "lucide-react";

export default function SupportDashboard() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.request("/staff/support/tickets?limit=100").catch(() => ({ tickets: [] }))
      .then((d: any) => {
        const tickets = d?.tickets || [];
        setData({
          open: tickets.filter((t: any) => t.status === "open").length,
          resolved: tickets.filter((t: any) => t.status === "resolved" || t.status === "closed").length,
          escalated: tickets.filter((t: any) => t.priority === "high" || t.priority === "urgent").length,
          slaBreaches: 0,
          tickets,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading support dashboard…</div>;
  // data is always defined (initialized with empty defaults)

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Support Dashboard</h1>
      <p className="text-slate-500 text-sm mb-6">Customer service tickets and SLA monitoring</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card icon={Ticket} label="Open Tickets" value={data.open} color="text-blue-600" bg="bg-blue-50" />
        <Card icon={CheckCircle} label="Resolved Tickets" value={data.resolved} color="text-green-600" bg="bg-green-50" />
        <Card icon={AlertCircle} label="Escalated" value={data.escalated} color="text-amber-600" bg="bg-amber-50" />
        <Card icon={Clock} label="SLA Breaches" value={data.slaBreaches} color="text-red-600" bg="bg-red-50" />
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Tickets</h3>
        {data.tickets.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No tickets yet</p>
        ) : (
          <div className="space-y-2">
            {data.tickets.slice(0, 10).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t.subject || t.name}</div>
                  <div className="text-xs text-slate-500">{t.email} • {new Date(t.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  t.status === "open" ? "bg-blue-100 text-blue-700" :
                  t.status === "resolved" ? "bg-green-100 text-green-700" :
                  "bg-slate-100 text-slate-700"
                }`}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
