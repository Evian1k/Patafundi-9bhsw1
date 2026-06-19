import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedAdminRoute } from "@/routes/guards";

import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import CreateJob from "@/pages/CreateJob";
import FundiRegister from "@/pages/FundiRegister";
import FundiPendingApproval from "@/pages/FundiPendingApproval";
import { FundiDashboard } from "@/pages/FundiDashboard";
import FundiJob from "@/pages/FundiJob";
import FundiWallet from "@/pages/FundiWallet";
import DisputeCenter from "@/pages/DisputeCenter";
import Settings from "@/pages/Settings";
import JobTracking from "@/pages/JobTracking";
import NotFound from "@/pages/NotFound";
import ServicePage from "@/pages/ServicePage";
import About from "@/pages/About";
import Careers from "@/pages/Careers";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import Press from "@/pages/Press";
import HowItWorks from "@/pages/HowItWorks";
import TrustSafety from "@/pages/TrustSafety";
import Investors from "@/pages/Investors";
import Contact from "@/pages/Contact";
import HelpCenter from "@/pages/HelpCenter";
import SafetyGuidelines from "@/pages/SafetyGuidelines";
import ContactSupport from "@/pages/ContactSupport";
import ReportProblem from "@/pages/ReportProblem";
import Socials from "@/pages/Socials";
import PolicyPage from "@/pages/PolicyPage";
import FundiResources from "@/pages/FundiResources";
import FundiApp from "@/pages/FundiApp";

import AdminLogin from "@/pages/admin/AdminLogin";
import AdminDashboard from "@/pages/admin/Dashboard";
import FundiVerificationManagement from "@/pages/admin/FundiVerificationManagement";
import CustomerManagement from "@/pages/admin/CustomerManagement";
import JobManagement from "@/pages/admin/JobManagement";
import PaymentsManagement from "@/pages/admin/PaymentsManagement";
import SecurityManagement from "@/pages/admin/SecurityManagement";
import ReportsAnalytics from "@/pages/admin/ReportsAnalytics";
import AdminSettings from "@/pages/admin/SettingsPage";
import AuditLogs from "@/pages/admin/AuditLogs";
import AdminDisputeManagement from "@/pages/admin/DisputeManagement";

// Staff dashboards (enterprise RBAC)
import StaffLayout from "@/components/staff/StaffLayout";
import StaffOverview from "@/pages/staff/StaffOverview";
import StaffDataTable from "@/pages/staff/StaffDataTable";
import StaffLogin from "@/pages/staff/StaffLogin";
import ExecutiveDashboard from "@/pages/staff/ExecutiveDashboard";
import AICommandCenter from "@/pages/staff/AICommandCenter";
import StaffManagement from "@/pages/staff/StaffManagement";
import CommissionControl from "@/pages/staff/CommissionControl";
import LiveOperations from "@/pages/staff/LiveOperations";

// Demo page is dev-only. In production builds, the route returns 404
// and the DemoPage component (with demo credentials) is tree-shaken out
// of the bundle via the dynamic import + SHOW_DEMO guard.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true";
const DemoPage = SHOW_DEMO ? lazy(() => import("@/pages/DemoPage")) : null;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/demo" element={
        SHOW_DEMO && DemoPage ? (
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
            <DemoPage />
          </Suspense>
        ) : <NotFound />
      } />
      <Route path="/register/customer" element={<Auth />} />
      <Route path="/register/fundi" element={<FundiRegister />} />

      <Route path="/customer" element={<Navigate to="/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/create-job" element={<CreateJob />} />
      <Route path="/job/:jobId/tracking" element={<JobTracking />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/disputes" element={<DisputeCenter />} />

      <Route path="/services/:slug" element={<ServicePage />} />

      <Route path="/about" element={<About />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/press" element={<Press />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/trust-safety" element={<TrustSafety />} />
      <Route path="/investors" element={<Investors />} />
      <Route path="/contact" element={<Contact />} />

      <Route path="/help" element={<HelpCenter />} />
      <Route path="/safety-guidelines" element={<SafetyGuidelines />} />
      <Route path="/contact-support" element={<ContactSupport />} />
      <Route path="/report-problem" element={<ReportProblem />} />
      <Route path="/socials" element={<Socials />} />

      <Route path="/privacy" element={<PolicyPage slug="privacy" />} />
      <Route path="/terms" element={<PolicyPage slug="terms" />} />
      <Route path="/cookies" element={<PolicyPage slug="cookies" />} />
      <Route path="/refund-policy" element={<PolicyPage slug="refund-policy" />} />
      <Route path="/platform-rules" element={<PolicyPage slug="platform-rules" />} />
      <Route path="/enforcement" element={<PolicyPage slug="enforcement" />} />
      <Route path="/policies/:slug" element={<PolicyPage />} />

      <Route path="/fundi/register" element={<Navigate to="/register/fundi" replace />} />
      <Route path="/fundi/pending" element={<FundiPendingApproval />} />
      <Route path="/fundi" element={<FundiDashboard />} />
      <Route path="/fundi/job/:jobId" element={<FundiJob />} />
      <Route path="/fundi/job/active" element={<FundiJob />} />
      <Route path="/fundi/wallet" element={<FundiWallet />} />
      <Route path="/fundi/disputes" element={<DisputeCenter />} />
      <Route path="/fundi/resources" element={<FundiResources />} />
      <Route path="/fundi/app" element={<FundiApp />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/dashboard" element={<ProtectedAdminRoute element={<AdminDashboard />} />} />
      <Route path="/admin/fundis" element={<ProtectedAdminRoute element={<FundiVerificationManagement />} />} />
      <Route path="/admin/customers" element={<ProtectedAdminRoute element={<CustomerManagement />} />} />
      <Route path="/admin/jobs" element={<ProtectedAdminRoute element={<JobManagement />} />} />
      <Route path="/admin/payments" element={<ProtectedAdminRoute element={<PaymentsManagement />} />} />
      <Route path="/admin/security" element={<ProtectedAdminRoute element={<SecurityManagement />} />} />
      <Route path="/admin/reports" element={<ProtectedAdminRoute element={<ReportsAnalytics />} />} />
      <Route path="/admin/settings" element={<ProtectedAdminRoute element={<AdminSettings />} />} />
      <Route path="/admin/audit-logs" element={<ProtectedAdminRoute element={<AuditLogs />} />} />
      <Route path="/admin/disputes" element={<ProtectedAdminRoute element={<AdminDisputeManagement />} />} />

      {/* Staff login portal — rejects customer/fundi accounts */}
      <Route path="/staff/login" element={<StaffLogin />} />

      {/* Staff dashboards (enterprise RBAC — permission-scoped) */}
      <Route path="/staff" element={<StaffLayout />}>
        <Route index element={<StaffOverview />} />
        <Route path="executive" element={<ExecutiveDashboard />} />
        <Route path="ai" element={<AICommandCenter />} />
        <Route path="staff-mgmt" element={<StaffManagement />} />
        <Route path="commission" element={<CommissionControl />} />
        <Route path="operations" element={<LiveOperations />} />
        <Route path="dispatch" element={<LiveOperations />} />
        <Route path="support" element={<StaffOverview />} />
        <Route path="fraud" element={
          <StaffDataTable resource="fraud-alerts" title="Fraud Alerts"
            columns={[
              { key: "alert_type", label: "Type" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Detected", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        } />
        <Route path="finance" element={
          <StaffDataTable resource="payments" title="Payments"
            columns={[
              { key: "amount", label: "Amount (KES)" },
              { key: "status", label: "Status" },
              { key: "escrow_status", label: "Escrow" },
              { key: "created_at", label: "Date", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
        <Route path="dispatch" element={<StaffOverview />} />
        <Route path="devops" element={<StaffOverview />} />
        <Route path="audit" element={
          <StaffDataTable resource="audit-logs" title="Audit Logs"
            columns={[
              { key: "action", label: "Action" },
              { key: "entity_type", label: "Entity" },
              { key: "created_at", label: "Time", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        } />
        <Route path="admin" element={<StaffOverview />} />
        <Route path="admin/fundis" element={
          <StaffDataTable resource="fundis" title="Fundi Management"
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "approval_status", label: "Status" },
              { key: "rating", label: "Rating" },
              { key: "created_at", label: "Joined", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
        <Route path="admin/jobs" element={
          <StaffDataTable resource="jobs" title="Job Management"
            columns={[
              { key: "service_category", label: "Category" },
              { key: "status", label: "Status" },
              { key: "customerName", label: "Customer" },
              { key: "fundiName", label: "Fundi" },
              { key: "estimated_price", label: "Price (KES)" },
              { key: "created_at", label: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
        <Route path="admin/users" element={
          <StaffDataTable resource="audit-logs" title="User Activity"
            columns={[
              { key: "action", label: "Action" },
              { key: "entity_type", label: "Entity" },
              { key: "created_at", label: "Time", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        } />
        <Route path="finance" element={
          <StaffDataTable resource="payments" title="Payments"
            columns={[
              { key: "amount", label: "Amount (KES)" },
              { key: "status", label: "Status" },
              { key: "escrow_status", label: "Escrow" },
              { key: "mpesa_receipt_number", label: "Receipt" },
              { key: "created_at", label: "Date", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
        <Route path="finance/revenue" element={<StaffOverview />} />
        <Route path="fraud" element={
          <StaffDataTable resource="fraud-alerts" title="Fraud Alerts"
            columns={[
              { key: "alert_type", label: "Type" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Detected", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        } />
        <Route path="support/disputes" element={
          <StaffDataTable resource="disputes" title="Disputes"
            columns={[
              { key: "reason", label: "Reason" },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Opened", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
        <Route path="audit" element={
          <StaffDataTable resource="audit-logs" title="Audit Logs"
            columns={[
              { key: "action", label: "Action" },
              { key: "entity_type", label: "Entity" },
              { key: "user_id", label: "User ID", render: (r) => String(r.user_id || "—").slice(0, 8) },
              { key: "created_at", label: "Time", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        } />
        <Route path="devops" element={<StaffOverview />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
