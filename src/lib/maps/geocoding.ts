import { apiClient } from '@/lib/api';
import type { StructuredAddress } from './types';

export const LOCATION_FALLBACK = 'Location identified';
export const LOCATION_AVAILABLE = 'Location available';

const COORDINATE_RE = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
const COORDINATE_IN_TEXT_RE = /-?\d+\.\d+\s*,\s*-?\d+\.\d+/;

export function isCoordinateString(value?: string | null): boolean {
  if (!value) return false;
  return COORDINATE_RE.test(value.trim()) || COORDINATE_IN_TEXT_RE.test(value.trim());
}

/** Strip any coordinate-like text before showing to users. */
export function sanitizeLocationText(value?: string | null, fallback = LOCATION_FALLBACK): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || isCoordinateString(trimmed)) return fallback;
  return trimmed;
}

export function formatAddressLines(address?: StructuredAddress | null): string[] {
  if (!address) return [LOCATION_FALLBACK];
  const rawLines = address.displayLines?.length
    ? address.displayLines
    : [
        address.building || address.buildingName,
        address.street,
        address.estate || address.neighborhood,
        address.town,
        address.county,
        address.country,
      ].filter(Boolean) as string[];

  const lines = rawLines
    .map((line) => sanitizeLocationText(line, ''))
    .filter(Boolean);

  if (lines.length) return lines;

  const label = sanitizeLocationText(
    address.fullLabel || address.formattedAddress || address.shortLabel,
    '',
  );
  return label ? [label] : [LOCATION_FALLBACK];
}

export function formatAddressShort(address?: StructuredAddress | null): string {
  const lines = formatAddressLines(address);
  return lines.slice(0, 2).join(', ') || LOCATION_FALLBACK;
}

export function formatAddressFull(address?: StructuredAddress | null): string {
  return formatAddressLines(address).join(', ') || LOCATION_FALLBACK;
}

export async function resolveStructuredAddress(
  latitude: number,
  longitude: number,
): Promise<StructuredAddress> {
  try {
    const data = await apiClient.reverseGeocode(latitude, longitude) as {
      address?: StructuredAddress;
      areaName?: string;
      formattedAddress?: string;
    };
    if (data.address) return data.address;
    const label = sanitizeLocationText(
      data.formattedAddress || data.areaName,
      LOCATION_FALLBACK,
    );
    return {
      fullLabel: label,
      shortLabel: label,
      displayLines: [label],
    };
  } catch {
    return { fullLabel: LOCATION_FALLBACK, shortLabel: LOCATION_FALLBACK, displayLines: [LOCATION_FALLBACK] };
  }
}
