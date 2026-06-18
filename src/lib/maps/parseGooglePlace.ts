import type { StructuredAddress } from './types';

type AddressComponent = google.maps.GeocoderAddressComponent;

function pickComponent(components: AddressComponent[], ...types: string[]): string | null {
  for (const type of types) {
    const match = components.find((c) => c.types.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return null;
}

export function parseAddressComponents(
  components: AddressComponent[] = [],
  formattedAddress?: string | null,
  placeName?: string | null,
): StructuredAddress {
  const building = pickComponent(components, 'premise', 'subpremise', 'establishment', 'point_of_interest');
  const street = pickComponent(components, 'route');
  const estate = pickComponent(components, 'neighborhood', 'sublocality', 'sublocality_level_1', 'sublocality_level_2');
  const town = pickComponent(components, 'locality', 'postal_town', 'administrative_area_level_2');
  const county = pickComponent(components, 'administrative_area_level_1');
  const country = pickComponent(components, 'country');

  const displayLines = [
    placeName || building,
    street,
    estate,
    town,
    county,
    country,
  ].filter(Boolean) as string[];

  const fullLabel = formattedAddress || displayLines.join(', ') || placeName || '';
  const shortLabel = [placeName || building || street, town || county].filter(Boolean).join(', ') || fullLabel;

  return {
    building: building || placeName || null,
    buildingName: building || placeName || null,
    street,
    estate,
    neighborhood: estate,
    town,
    county,
    country,
    formattedAddress: formattedAddress || fullLabel,
    displayLines: displayLines.length ? displayLines : (fullLabel ? [fullLabel] : []),
    shortLabel,
    fullLabel,
  };
}

export function placeResultToSelection(
  place: google.maps.places.PlaceResult,
): { formattedAddress: string; latitude: number; longitude: number; address: StructuredAddress; placeId?: string } | null {
  const lat = place.geometry?.location?.lat();
  const lng = place.geometry?.location?.lng();
  if (lat == null || lng == null) return null;

  const formattedAddress = place.formatted_address || place.name || '';
  const address = parseAddressComponents(place.address_components, formattedAddress, place.name);

  return {
    formattedAddress: formattedAddress || address.fullLabel || '',
    latitude: lat,
    longitude: lng,
    address,
    placeId: place.place_id,
  };
}

export function geocoderResultToSelection(
  result: google.maps.GeocoderResult,
): { formattedAddress: string; latitude: number; longitude: number; address: StructuredAddress } | null {
  const lat = result.geometry?.location?.lat();
  const lng = result.geometry?.location?.lng();
  if (lat == null || lng == null) return null;

  const formattedAddress = result.formatted_address || '';
  const address = parseAddressComponents(result.address_components, formattedAddress);

  return {
    formattedAddress: formattedAddress || address.fullLabel || '',
    latitude: lat,
    longitude: lng,
    address,
  };
}
