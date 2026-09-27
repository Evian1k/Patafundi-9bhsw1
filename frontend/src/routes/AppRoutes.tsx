import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedAdminRoute } from "@/routes/guards";

import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Bookings from "@/pages/customer/Bookings";
import Favorites from "@/pages/customer/Favorites";
import FundiProfile from "@/pages/customer/FundiProfile";
import CreateJob from "@/pages/CreateJob";
import FundiRegister from "@/pages/FundiRegister";
import FundiPendingApproval from "@/pages/FundiPendingApproval";
import { FundiDashboard } from "@/pages/FundiDashboard";
import FundiJob from "@/pages/FundiJob";
import FundiWallet from "@/pages/FundiWallet";
import FundiProfileEdit from "@/pages/fundi/FundiProfileEdit";
import FundiMyReviews from "@/pages/fundi/FundiMyReviews";
import DisputeCenter from "@/pages/DisputeCenter";
import Settings from "@/pages/Settings";
import JobTracking from "@/pages/JobTracking";
import NotFound from "@/pages/NotFound";
import ServicePage from "@/pages/ServicePage";
import About from "@/pages/About";
import HowItWorks from "@/pages/HowItWorks";
import TrustSafety from "@/pages/TrustSafety";
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
import CompanyApplications from "@/pages/admin/CompanyApplications";
import CompanyDetail from "@/pages/admin/CompanyDetail";
import AdminPayouts from "@/pages/admin/AdminPayouts";
import AdminRefunds from "@/pages/admin/AdminRefunds";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminReviews from "@/pages/admin/AdminReviews";

// Company ecosystem (takeover) — public directory + partner program + portal
import CompanyDirectory from "@/pages/company/CompanyDirectory";
import CompanyProfile from "@/pages/company/CompanyProfile";
import PartnerProgram from "@/pages/company/PartnerProgram";
import CompanyPortalLayout from "@/pages/company/CompanyPortalLayout";
import PortalDashboard from "@/pages/company/PortalDashboard";
import PortalJobs from "@/pages/company/PortalJobs";
import PortalTeam from "@/pages/company/PortalTeam";
import PortalServices from "@/pages/company/PortalServices";
import PortalSchedule from "@/pages/company/PortalSchedule";
import PortalQuality from "@/pages/company/PortalQuality";
import PortalFinance from "@/pages/company/PortalFinance";
import PortalSettings from "@/pages/company/PortalSettings";
import TechnicianApp from "@/pages/company/TechnicianApp";

// Staff role-specific dashboards (takeover)
import StaffRoleHome from "@/pages/staff/StaffRoleHome";
import ErrorLogs from "@/pages/staff/ErrorLogs";

// Staff dashboards (enterprise RBAC)
import StaffLayout from "@/components/staff/StaffLayout";
import StaffOverview from "@/pages/staff/StaffOverview";
import StaffDataTable from "@/pages/staff/StaffDataTable";
import StaffLogin from "@/pages/staff/StaffLogin";
import ExecutiveDashboard from "@/pages/staff/ExecutiveDashboard";
import RevenuePage from "@/pages/staff/RevenuePage";
import AICommandCenter from "@/pages/staff/AICommandCenter";
import StaffManagement from "@/pages/staff/StaffManagement";
import CommissionControl from "@/pages/staff/CommissionControl";
import LiveOperations from "@/pages/staff/LiveOperations";
import SecurityCenter from "@/pages/staff/SecurityCenter";
import SystemSettings from "@/pages/staff/SystemSettings";

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
      <Route path="/demo/company" element={<Navigate to="/companies" replace />} />
      <Route path="/companies" element={<CompanyDirectory />} />
      <Route path="/companies/:id" element={<CompanyProfile />} />
      <Route path="/partner-program" element={<PartnerProgram />} />
      <Route path="/register/customer" element={<Auth />} />
      <Route path="/register/fundi" element={<FundiRegister />} />

      <Route path="/customer" element={<Navigate to="/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/bookings" element={<Bookings />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/fundis/:fundiId" element={<FundiProfile />} />
      <Route path="/create-job" element={<CreateJob />} />
      <Route path="/job/:jobId/tracking" element={<JobTracking />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/disputes" element={<DisputeCenter />} />

      <Route path="/services/:slug" element={<ServicePage />} />

      {/* ── Company portal (organization-scoped; server-side RBAC) ── */}
      <Route path="/company" element={<CompanyPortalLayout />}>
        <Route index element={<PortalDashboard />} />
        <Route path="jobs" element={<PortalJobs />} />
        <Route path="team" element={<PortalTeam />} />
        <Route path="services" element={<PortalServices />} />
        <Route path="schedule" element={<PortalSchedule />} />
        <Route path="quality" element={<PortalQuality />} />
        <Route path="finance" element={<PortalFinance />} />
        <Route path="settings" element={<PortalSettings />} />
      </Route>
      <Route path="/technician" element={<TechnicianApp />} />

      <Route path="/about" element={<About />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/trust-safety" element={<TrustSafety />} />
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
      <Route path="/fundi/profile/edit" element={<FundiProfileEdit />} />
      <Route path="/fundi/reviews" element={<FundiMyReviews />} />
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
      <Route path="/admin/payouts" element={<ProtectedAdminRoute element={<AdminPayouts />} />} />
      <Route path="/admin/refunds" element={<ProtectedAdminRoute element={<AdminRefunds />} />} />
      <Route path="/admin/subscriptions" element={<ProtectedAdminRoute element={<AdminSubscriptions />} />} />
      <Route path="/admin/reviews" element={<ProtectedAdminRoute element={<AdminReviews />} />} />
      <Route path="/admin/audit-logs" element={<ProtectedAdminRoute element={<AuditLogs />} />} />
      <Route path="/admin/disputes" element={<ProtectedAdminRoute element={<AdminDisputeManagement />} />} />
      <Route path="/admin/companies" element={<ProtectedAdminRoute element={<CompanyApplications />} />} />
      <Route path="/admin/companies/:id" element={<ProtectedAdminRoute element={<CompanyDetail />} />} />

      {/* Staff login portal — rejects customer/fundi accounts */}
      <Route path="/staff/login" element={<StaffLogin />} />

      {/* Staff dashboards (enterprise RBAC — permission-scoped) */}
      <Route path="/staff" element={<StaffLayout />}>
        <Route index element={<StaffOverview />} />
        <Route path="executive" element={<ExecutiveDashboard />} />
        <Route path="ai" element={<AICommandCenter />} />
        <Route path="security" element={<SecurityCenter />} />
        <Route path="system" element={<SystemSettings />} />
        <Route path="staff-mgmt" element={<StaffManagement />} />
        <Route path="commission" element={<CommissionControl />} />
        <Route path="operations" element={<LiveOperations />} />
        {/* Role-specific dashboards (takeover: real data per role) */}
        <Route path="dispatch" element={<StaffRoleHome role="dispatch_team" />} />
        <Route path="finance" element={<StaffRoleHome role="finance_team" />} />
        <Route path="finance/revenue" element={<RevenuePage />} />
        <Route path="fraud" element={<StaffRoleHome role="fraud_analyst" />} />
        <Route path="audit" element={<StaffRoleHome role="auditor" />} />
        <Route path="devops" element={<StaffRoleHome role="devops_engineer" />} />
        <Route path="devops/errors" element={<ErrorLogs />} />
        <Route path="support" element={<StaffRoleHome role="support_agent" />} />
        <Route path="admin" element={<StaffRoleHome role="admin" />} />
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
        <Route path="support/disputes" element={
          <StaffDataTable resource="disputes" title="Disputes"
            columns={[
              { key: "reason", label: "Reason" },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Opened", render: (r) => new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        } />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
