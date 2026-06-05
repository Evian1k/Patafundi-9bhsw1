const GENERIC_FALLBACK = 'Location identified';

function pickComponent(components, ...types) {
  for (const type of types) {
    const match = components.find((c) => c.types?.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return null;
}

export function parseGoogleAddress(result) {
  const components = result?.address_components || [];
  return {
    building: pickComponent(components, 'premise', 'subpremise', 'establishment'),
    buildingName: pickComponent(components, 'premise', 'subpremise', 'establishment'),
    street: pickComponent(components, 'route'),
    estate: pickComponent(components, 'neighborhood', 'sublocality', 'sublocality_level_1', 'sublocality_level_2'),
    neighborhood: pickComponent(components, 'neighborhood', 'sublocality', 'sublocality_level_1'),
    town: pickComponent(components, 'locality', 'postal_town', 'administrative_area_level_2'),
    county: pickComponent(components, 'administrative_area_level_1'),
    country: pickComponent(components, 'country'),
    formattedAddress: result?.formatted_address || null,
  };
}

export function formatStructuredAddress(address) {
  const lines = [
    address.building || address.buildingName,
    address.street,
    address.estate || address.neighborhood,
    address.town,
    address.county,
    address.country,
  ].filter(Boolean);
  return {
    ...address,
    displayLines: lines,
    shortLabel: lines.slice(0, 2).join(', ') || address.formattedAddress || GENERIC_FALLBACK,
    fullLabel: lines.join(', ') || address.formattedAddress || GENERIC_FALLBACK,
  };
}

export async function googleReverseGeocode(latitude, longitude, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`;
  const response = await fetch(url);
  const data = await response.json();
  const result = data.results?.[0];
  if (!result) throw new Error('Google reverse geocode returned no results');
  return formatStructuredAddress(parseGoogleAddress(result));
}

export async function googlePlacesAutocomplete(input, key) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('components', 'country:ke');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  return data.predictions || [];
}
