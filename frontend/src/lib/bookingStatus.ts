/**
 * Canonical booking status taxonomy (shared across web + mobile).
 *
 * Mirrors backend/src/services/jobStateMachine.js. Every classification in
 * the UI must use these groups - NEVER a fallthrough default that could show
 * a quoted or in-progress booking as "Completed" (the bug this module fixes).
 */

export const QUOTE_PHASE_STATUSES = ["quote_requested", "offered"];

export const CUSTOMER_ACTIVE_STATUSES = [
  "pending", "matching", "quote_requested", "offered", "accepted",
  "booking_confirmed", "assigned", "scheduled",
  "on_the_way", "arrived", "in_progress", "completion_requested",
  "customer_confirmed_completion", "payment_pending", "payment_processing",
];

export const CUSTOMER_COMPLETED_STATUSES = ["payment_confirmed", "completed", "closed"];

export const CANCELLED_STATUSES = ["cancelled", "failed", "expired"];

export const DISPUTED_STATUSES = ["disputed", "refund_requested", "refunded"];

/** Provider-side active set (spec section 8). */
export const PROVIDER_ACTIVE_STATUSES = [
  "accepted", "offered", "booking_confirmed", "scheduled",
  "on_the_way", "arrived", "in_progress", "completion_requested",
];

export const PROVIDER_COMPLETED_STATUSES = ["completed", "closed"];

export const STATUS_LABELS = {
  pending: "Requested",
  matching: "Finding a professional",
  quote_requested: "Quote requested",
  offered: "Quote received",
  accepted: "Quote accepted",
  booking_confirmed: "Booking confirmed",
  assigned: "Technician assigned",
  scheduled: "Scheduled",
  on_the_way: "Professional arriving",
  arrived: "Checked in",
  in_progress: "Work in progress",
  completion_requested: "Confirm completion",
  customer_confirmed_completion: "Completion confirmed",
  payment_pending: "Payment pending",
  payment_processing: "Payment processing",
  payment_confirmed: "Payment confirmed",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
  failed: "Failed",
  expired: "Expired",
  disputed: "Under dispute",
  refund_requested: "Refund requested",
  refunded: "Refunded",
};

export function statusLabel(status?: string | null): string {
  const s = String(status || "").toLowerCase();
  return STATUS_LABELS[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Classify a booking for the customer Bookings tabs.
 * Unknown statuses are treated as ACTIVE (never silently "completed") - the
 * customer must always be able to find a booking that is not finished.
 */
export type BookingTab = "active" | "scheduled" | "completed" | "cancelled" | "disputed";

export function classifyCustomerBooking(
  status?: string | null,
  scheduledAt?: string | null,
): BookingTab {
  const s = String(status || "").toLowerCase();
  if (DISPUTED_STATUSES.includes(s)) return "disputed";
  if (CUSTOMER_COMPLETED_STATUSES.includes(s)) {
    // Work done but the customer has not confirmed completion yet: it still
    // needs their action, so it behaves as active (completion pending).
    return s === "completed" ? "completed" : "active";
  }
  if (CANCELLED_STATUSES.includes(s)) return "cancelled";
  if (CUSTOMER_ACTIVE_STATUSES.includes(s)) {
    if (s === "scheduled" || (s === "booking_confirmed" && scheduledAt)) return "scheduled";
    return "active";
  }
  // Unknown / future status: honest default is active, never completed.
  return "active";
}

export function isQuotePhase(status?: string | null): boolean {
  return QUOTE_PHASE_STATUSES.includes(String(status || "").toLowerCase());
}
