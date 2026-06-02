/**
 * usePushNotifications — Web Push Notifications via Notification API
 * Works in background tabs. Falls back gracefully if not supported.
 */
import { useEffect, useRef, useCallback } from "react";
import { realtimeService } from "@/services/realtime";

export type NotifPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
  onClick?: () => void;
};

export function usePushNotifications() {
  const permissionRef = useRef<NotificationPermission>("default");
  const callbacksRef = useRef<Map<string, () => void>>(new Map());

  // Request permission on mount
  useEffect(() => {
    if (!("Notification" in window)) return;
    permissionRef.current = Notification.permission;
    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    }
  }, []);

  const notify = useCallback(({ title, body, icon = "/favicon.ico", tag, data, onClick }: NotifPayload) => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Don't notify if page is visible
    if (document.visibilityState === "visible") return;

    const n = new Notification(title, {
      body,
      icon,
      tag,
      data,
      badge: "/favicon.ico",
    } as NotificationOptions);

    if (onClick) {
      const id = tag ?? Math.random().toString(36);
      callbacksRef.current.set(id, onClick);
      n.onclick = () => {
        window.focus();
        callbacksRef.current.get(id)?.();
        callbacksRef.current.delete(id);
        n.close();
      };
    }
  }, []);

  // Wire up to socket events
  useEffect(() => {
    const onJobAccepted = (payload: Record<string, unknown>) => {
      notify({
        title: "Fundi Accepted Your Job!",
        body: `Your fundi is on the way. Job #${String(payload?.jobId ?? "").slice(-6)}`,
        tag: `job-accepted-${payload?.jobId}`,
        onClick: () => {
          window.location.href = `/job/${payload?.jobId}/tracking`;
        },
      });
    };

    const onPaymentConfirmed = (payload: Record<string, unknown>) => {
      notify({
        title: "Payment Confirmed ✓",
        body: `KES ${payload?.amount ?? ""} received via M-Pesa`,
        tag: `payment-${payload?.jobId}`,
      });
    };

    const onDisputeOpened = (payload: Record<string, unknown>) => {
      notify({
        title: "New Dispute Filed",
        body: `${String(payload?.customerName ?? "A user")} opened a dispute`,
        tag: `dispute-${payload?.disputeId}`,
        onClick: () => { window.location.href = "/admin/disputes"; },
      });
    };

    const onJobRequest = (payload: Record<string, unknown>) => {
      notify({
        title: "New Job Request!",
        body: `${String(payload?.serviceType ?? "A customer")} needs help near you`,
        tag: `job-request-${payload?.jobId}`,
        onClick: () => { window.focus(); },
      });
    };

    const onPayoutCompleted = (payload: Record<string, unknown>) => {
      notify({
        title: "Payout Sent!",
        body: `KES ${payload?.amount ?? ""} has been sent to your M-Pesa`,
        tag: `payout-${payload?.payoutId}`,
        onClick: () => { window.location.href = "/fundi/wallet"; },
      });
    };

    const onTrustUpdated = (payload: Record<string, unknown>) => {
      const delta = Number(payload?.delta ?? 0);
      if (delta < 0) {
        notify({
          title: "Trust Score Reduced",
          body: `Your trust score dropped by ${Math.abs(delta)} points due to suspicious activity.`,
          tag: "trust-updated",
        });
      }
    };

    realtimeService.on("job:accepted", onJobAccepted);
    realtimeService.on("payment:confirmed", onPaymentConfirmed);
    realtimeService.on("dispute:opened", onDisputeOpened);
    realtimeService.on("job:request", onJobRequest);
    realtimeService.on("payout:completed", onPayoutCompleted);
    realtimeService.on("trust:updated", onTrustUpdated);

    return () => {
      realtimeService.off("job:accepted", onJobAccepted);
      realtimeService.off("payment:confirmed", onPaymentConfirmed);
      realtimeService.off("dispute:opened", onDisputeOpened);
      realtimeService.off("job:request", onJobRequest);
      realtimeService.off("payout:completed", onPayoutCompleted);
      realtimeService.off("trust:updated", onTrustUpdated);
    };
  }, [notify]);

  return {
    notify,
    isSupported: "Notification" in window,
    permission: permissionRef.current,
  };
}
