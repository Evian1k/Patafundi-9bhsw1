export interface ServiceCategory {
  id: string;
  slug: string;
  title: string;
  label: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  aliases: string[];
  sortOrder: number;
  isActive: boolean;
  countryCode: string | null;
  isAvailable: boolean;
  pricingMode: "automatic" | "quote_required";
  basePrice: number | null;
  minimumPrice: number | null;
  maximumPrice: number | null;
  estimatedDurationMinutes: number | null;
}

/** All service entry points use the canonical backend slug. */
export function bookingPathForService(serviceSlug: string): string {
  return `/create-job?service=${encodeURIComponent(serviceSlug)}`;
}
