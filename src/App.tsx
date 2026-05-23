import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NetworkReconnectBanner from "@/components/system/NetworkReconnectBanner";

// Pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CreateJob from "./pages/CreateJob";
import FundiRegister from "./pages/FundiRegister";
import FundiPendingApproval from "./pages/FundiPendingApproval";
import { FundiDashboard } from "./pages/FundiDashboard";
import FundiJob from "./pages/FundiJob";
import FundiWallet from "./pages/FundiWallet";
import DisputeCenter from "./pages/DisputeCenter";
import Settings from "./pages/Settings";
import JobTracking from "./pages/JobTracking";
import NotFound from "./pages/NotFound";
import ServicePage from "./pages/ServicePage";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Press from "./pages/Press";
import HowItWorks from "./pages/HowItWorks";
import TrustSafety from "./pages/TrustSafety";
import Investors from "./pages/Investors";
import Contact from "./pages/Contact";
import HelpCenter from "./pages/HelpCenter";
import SafetyGuidelines from "./pages/SafetyGuidelines";
import ContactSupport from "./pages/ContactSupport";
import ReportProblem from "./pages/ReportProblem";
import Socials from "./pages/Socials";
import PolicyPage from "./pages/PolicyPage";
import FundiResources from "./pages/FundiResources";
import FundiApp from "./pages/FundiApp";

// Admin pages
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/Dashboard";
import FundiVerificationManagement from "./pages/admin/FundiVerificationManagement";
import CustomerManagement from "./pages/admin/CustomerManagement";
import JobManagement from "./pages/admin/JobManagement";
import PaymentsManagement from "./pages/admin/PaymentsManagement";
import SecurityManagement from "./pages/admin/SecurityManagement";
import ReportsAnalytics from "./pages/admin/ReportsAnalytics";
import AdminSettings from "./pages/admin/SettingsPage";
import AuditLogs from "./pages/admin/AuditLogs";
import AdminDisputeManagement from "./pages/admin/DisputeManagement";

/** Fast client-side admin gate — AdminLayout does server-side verification. */
const isAdmin = () => {
  try {
    const token = localStorage.getItem("auth_token");
    if (!token) return false;
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      decodeURIComponent(
        atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      )
    );
    return payload.role === "admin" || (Array.isArray(payload.roles) && payload.roles.includes("admin"));
  } catch { return false; }
};

const ProtectedAdminRoute = ({ element }: { element: React.ReactNode }) => {
  const token = localStorage.getItem("auth_token");
  if (!token || !isAdmin()) return <Navigate to="/admin/login" replace />;
  return <>{element}</>;
};

const App = () => {
  const qcRef = useRef<QueryClient | null>(null);
  if (!qcRef.current) {
    qcRef.current = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      },
    });
  }

  return (
    <QueryClientProvider client={qcRef.current}>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-center" />
        <BrowserRouter>
          {/* Network status banner — shown app-wide */}
          <NetworkReconnectBanner />

          <Routes>
            {/* Public landing */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />

            {/* Customer routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/create-job" element={<CreateJob />} />
            <Route path="/job/:jobId/tracking" element={<JobTracking />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/disputes" element={<DisputeCenter />} />

            {/* Services */}
            <Route path="/services/:slug" element={<ServicePage />} />

            {/* Company */}
            <Route path="/about" element={<About />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/press" element={<Press />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/trust-safety" element={<TrustSafety />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/contact" element={<Contact />} />

            {/* Support */}
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/safety-guidelines" element={<SafetyGuidelines />} />
            <Route path="/contact-support" element={<ContactSupport />} />
            <Route path="/report-problem" element={<ReportProblem />} />
            <Route path="/socials" element={<Socials />} />

            {/* Legal / Policies */}
            <Route path="/privacy" element={<PolicyPage slug="privacy" />} />
            <Route path="/terms" element={<PolicyPage slug="terms" />} />
            <Route path="/cookies" element={<PolicyPage slug="cookies" />} />
            <Route path="/refund-policy" element={<PolicyPage slug="refund-policy" />} />
            <Route path="/platform-rules" element={<PolicyPage slug="platform-rules" />} />
            <Route path="/enforcement" element={<PolicyPage slug="enforcement" />} />
            <Route path="/policies/:slug" element={<PolicyPage />} />

            {/* Fundi flows */}
            <Route path="/fundi/register" element={<FundiRegister />} />
            <Route path="/fundi/pending" element={<FundiPendingApproval />} />
            <Route path="/fundi" element={<FundiDashboard />} />
            <Route path="/fundi/job/:jobId" element={<FundiJob />} />
            <Route path="/fundi/job/active" element={<FundiJob />} />
            <Route path="/fundi/wallet" element={<FundiWallet />} />
            <Route path="/fundi/disputes" element={<DisputeCenter />} />
            <Route path="/fundi/resources" element={<FundiResources />} />
            <Route path="/fundi/app" element={<FundiApp />} />

            {/* Admin */}
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

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
