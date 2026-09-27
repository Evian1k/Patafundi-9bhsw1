/**
 * Generic staff data table — used for fundis, jobs, payments, disputes, audit logs.
 * Fetches from the appropriate /api/staff/* endpoint based on the `resource` prop.
 * Permission is enforced server-side; this component just renders the data.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { useReducedMotion, fadeUp } from "@/lib/motion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface StaffDataTableProps {
  resource: "fundis" | "jobs" | "payments" | "disputes" | "audit-logs" | "fraud-alerts";
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: Array<{ key: string; label: string; render?: (row: any) => React.ReactNode }>;
}

const ENDPOINTS: Record<StaffDataTableProps["resource"], string> = {
  fundis: "/staff/fundis",
  jobs: "/staff/jobs",
  payments: "/staff/payments",
  disputes: "/staff/disputes",
  "audit-logs": "/staff/audit-logs",
  "fraud-alerts": "/staff/fraud/alerts",
};

export default function StaffDataTable({ resource, title, columns }: StaffDataTableProps) {
  const reduceMotion = useReducedMotion();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        // apiClient: absolute API URL + auth headers; throws ApiError with a
        // user-safe message on failure (never leaks raw server errors).
        const data = await apiClient.request(ENDPOINTS[resource]) as Record<string, unknown>;
        // Different endpoints return different keys — try common ones.
        const key = resource.replace("-", "_");
        const list = (data[key] || data.fundis || data.jobs || data.payments || data.disputes || data.logs || data.alerts || []) as Row[];
        setRows(Array.isArray(list) ? list : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [resource]);

  if (loading) return <div className="p-8 text-slate-400">Loading {title}…</div>;

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <strong>Access denied or error:</strong> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.h1
        initial={reduceMotion ? {} : "hidden"}
        animate="visible"
        variants={fadeUp}
        className="text-2xl font-bold text-slate-900 mb-6"
      >
        {title}
      </motion.h1>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 font-medium text-slate-600">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                    No records found.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-slate-700">
                        {col.render ? col.render(row) : String(row[col.key] ?? "Not recorded")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
