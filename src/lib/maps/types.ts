export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface StructuredAddress {
  building?: string | null;
  buildingName?: string | null;
  street?: string | null;
  estate?: string | null;
  neighborhood?: string | null;
  town?: string | null;
  county?: string | null;
  country?: string | null;
  formattedAddress?: string | null;
  displayLines?: string[];
  shortLabel?: string;
  fullLabel?: string;
}

export interface DirectionsStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver?: string | null;
  endLocation?: Coordinates;
}

export interface DirectionsResult {
  distanceKm: number;
  distanceMeters: number;
  etaMinutes: number;
  etaSeconds: number;
  polyline: string | null;
  steps: DirectionsStep[];
  source: string;
}

export interface NearbyFundi {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  distanceKm?: number;
  skills?: string[];
}

export type MapTheme = 'light' | 'dark';
