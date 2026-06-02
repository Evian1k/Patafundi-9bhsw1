/**
 * Push notification wiring hook — attaches to app root.
 * Initializes push notification permission and socket listeners
 * for the currently logged-in user.
 */
import { useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { realtimeService } from "@/services/realtime";

/**
 * Drop this inside any authenticated layout to enable push notifications.
 * Listens to socket events and triggers browser notifications when page is hidden.
 */
export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  usePushNotifications(); // initializes listeners
  return <>{children}</>;
}

/**
 * Lightweight component to initialize push notifications when logged in.
 * Add to Dashboard, FundiDashboard, JobTracking etc.
 */
export function usePushInit() {
  usePushNotifications();

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token && !realtimeService.isConnected()) {
      realtimeService.connect(token);
    }
  }, []);
}
