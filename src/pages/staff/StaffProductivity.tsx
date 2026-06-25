/**
 * Staff Productivity Dashboard — Super Admin + DevOps
 * Tracks metrics for all staff by department
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Users, Ticket, DollarSign, Shield, Package, TrendingUp } from "lucide-react";

export default function StaffProductivity() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    apiClient.request(`/staff/productivity/all?days=${days}`).catch(() => ({ staff: [] }))
      .then((d: any) => setStaff(d?.staff || []))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="p-8 text-slate-400">Loading productivity data…</div>;

  const fmt = (n: any) => Number(n || 0).toLocaleString();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Productivity</h1>
          <p className="text-slate-500 text-sm">Performance metrics across all staff members</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {staff.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No productivity data yet. Metrics are recorded as staff perform actions.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-center">Tickets</th>
                  <th className="p-3 text-center">Payments</th>
                  <th className="p-3 text-center">Revenue</th>
                  <th className="p-3 text-center">Jobs Assigned</th>
                  <th className="p-3 text-center">Fraud Cases</th>
                  <th className="p-3 text-center">Incidents</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{s.full_name}</div>
                      <div className="text-xs text-slate-500">{s.email}</div>
                    </td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-1 bg-slate-100 rounded-full capitalize">{s.department || s.role}</span>
                    </td>
                    <td className="p-3 text-center font-medium">{fmt(s.total_tickets)}</td>
                    <td className="p-3 text-center font-medium">{fmt(s.total_payments)}</td>
                    <td className="p-3 text-center font-medium text-green-600">KES {fmt(s.total_revenue)}</td>
                    <td className="p-3 text-center font-medium">{fmt(s.total_jobs)}</td>
                    <td className="p-3 text-center font-medium">{fmt(s.total_fraud_cases)}</td>
                    <td className="p-3 text-center font-medium">{fmt(s.total_incidents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
