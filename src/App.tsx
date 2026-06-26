import { useRef } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoogleMapsProvider } from "@/components/maps/GoogleMapsProvider";
import NetworkReconnectBanner from "@/components/system/NetworkReconnectBanner";
import MaintenanceGuard from "@/components/system/MaintenanceGuard";
import MaintenanceBanner from "@/components/system/MaintenanceBanner";
import CookieConsent from "@/components/system/CookieConsent";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import { AppRoutes } from "@/routes";

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
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GoogleMapsProvider>
            <MaintenanceGuard>
              <MaintenanceBanner />
              <NetworkReconnectBanner />
              <AppRoutes />
              <MobileBottomNav />
              <CookieConsent />
            </MaintenanceGuard>
          </GoogleMapsProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
