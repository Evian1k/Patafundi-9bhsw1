import { useRef } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoogleMapsProvider } from "@/components/maps/GoogleMapsProvider";
import NetworkReconnectBanner from "@/components/system/NetworkReconnectBanner";
import RouteErrorBoundary from "@/components/system/RouteErrorBoundary";
import { CountryProvider } from "@/lib/country";
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
          {/* reducedMotion="user" honors the OS "reduce motion" setting for
              EVERY framer-motion animation in the app (accessibility §61). */}
          <MotionConfig reducedMotion="user">
            <GoogleMapsProvider>
              <CountryProvider>
                <NetworkReconnectBanner />
                {/* Global crash boundary: users never see raw errors; crashes are
                    reported to /api/client-errors and routed to DevOps staff. */}
                <RouteErrorBoundary>
                  <AppRoutes />
                </RouteErrorBoundary>
              </CountryProvider>
            </GoogleMapsProvider>
          </MotionConfig>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
