import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Download, Loader2, Users, Briefcase, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";

interface ReportData {
  date: string;
  jobs: number;
  revenue: number;
  customers: number;
  fundis: number;
}

interface TopFundi {
  id: string;
  name: string;
  jobCount: number;
  rating: number;
}

export default function ReportsAnalytics() {
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [topFundis, setTopFundis] = useState<TopFundi[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("30d");

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await apiClient.request(`/admin/reports?range=${dateRange}`, { includeAuth: true }) as {
        chartData?: Record<string, unknown>[];
        topFundis?: Record<string, unknown>[];
      };
      const chartData = Array.isArray(response.chartData) ? response.chartData : [];
      setReportData(chartData.map((r) => ({
        date: (r.date as string) || "",
        jobs: typeof r.jobs === "number" ? r.jobs : Number(r.jobs) || 0,
        revenue: typeof r.revenue === "number" ? r.revenue : Number(r.revenue) || 0,
        customers: typeof r.customers === "number" ? r.customers : Number(r.customers) || 0,
        fundis: typeof r.fundis === "number" ? r.fundis : Number(r.fundis) || 0,
      })));
      const top = Array.isArray(response.topFundis) ? response.topFundis : [];
      setTopFundis(top.map((t) => ({
        id: (t.id as string) ?? `${t.name}-${Math.random().toString(36).slice(2, 8)}`,
        name: (t.name as string) ?? "Unknown",
        jobCount: typeof t.jobCount === "number" ? t.jobCount : Number(t.jobCount) || 0,
        rating: typeof t.rating === "number" ? t.rating : Number(t.rating) || 0,
      })));
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [dateRange]);

  const handleExportCSV = () => {
    try {
      const csv = [
        ["Date", "Jobs", "Revenue", "Customers", "Fundis"],
        ...reportData.map((row) => [row.date, row.jobs, row.revenue, row.customers, row.fundis]),
      ].map((row) => row.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `patafundi-report-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    }
  };

  const stats = reportData.length > 0 ? reportData[reportData.length - 1] : null;
  const formatCurrency = (v: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(v);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground text-sm">View platform performance metrics</p>
          </div>
          <div className="flex gap-3">
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value as "7d" | "30d" | "90d")} className="px-4 py-2 border rounded-lg bg-white text-sm">
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />Export CSV
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Briefcase, label: "Jobs Completed", value: stats.jobs ?? 0, color: "text-primary bg-primary/10" },
              { icon: DollarSign, label: "Total Revenue", value: formatCurrency(stats.revenue ?? 0), color: "text-green-600 bg-green-50" },
              { icon: Users, label: "Active Customers", value: stats.customers ?? 0, color: "text-blue-600 bg-blue-50" },
              { icon: BarChart3, label: "Active Fundis", value: stats.fundis ?? 0, color: "text-purple-600 bg-purple-50" },
            ].map(({ icon: Icon, label, value, color }) => (
              <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-4">
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}><Icon className="w-4 h-4" /></div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-bold text-lg">{value}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Charts */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Loading reports...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-semibold mb-4">Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={reportData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(174 72% 40%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-4">Jobs Completed</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={reportData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="jobs" fill="hsl(25 95% 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* Top Fundis */}
        {!loading && topFundis.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Top Performing Fundis</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Jobs Completed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topFundis.map((fundi, idx) => (
                    <tr key={fundi.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">#{idx + 1} {fundi.name}</td>
                      <td className="px-4 py-2">{fundi.jobCount} jobs</td>
                      <td className="px-4 py-2">⭐ {typeof fundi.rating === "number" ? fundi.rating.toFixed(1) : String(fundi.rating ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
