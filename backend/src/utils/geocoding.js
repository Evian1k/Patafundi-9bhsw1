const GENERIC_FALLBACK = 'Address not available';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_UA = process.env.NOMINATIM_USER_AGENT || 'PataFundi/1.0 (location service)';

async function nominatimFetch(path, params) {
  const url = new URL(`${NOMINATIM_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_UA,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Nominatim request failed: ${response.status}`);
  return response.json();
}

export function parseNominatimAddress(result) {
  const addr = result?.address || {};
  const streetParts = [addr.house_number, addr.road || addr.pedestrian || addr.footway || addr.path]
    .filter(Boolean);
  const street = streetParts.join(' ') || null;
  const estate = addr.suburb
    || addr.neighbourhood
    || addr.quarter
    || addr.residential
    || addr.hamlet
    || null;
  const town = addr.city || addr.town || addr.village || addr.municipality || null;
  const county = addr.county || addr.state || addr.state_district || null;
  const country = addr.country || null;
  const building = addr.building || addr.amenity || addr.shop || result?.name || null;

  return {
    building,
    buildingName: building,
    street,
    estate,
    neighborhood: estate,
    town,
    county,
    country,
    formattedAddress: result?.display_name || null,
    latitude: result?.lat != null ? Number(result.lat) : null,
    longitude: result?.lon != null ? Number(result.lon) : null,
  };
}

export async function nominatimReverseGeocode(latitude, longitude) {
  const data = await nominatimFetch('/reverse', {
    lat: latitude,
    lon: longitude,
    format: 'json',
    addressdetails: 1,
  });
  if (!data || data.error) {
    throw new Error(data?.error || 'Nominatim reverse geocode returned no results');
  }
  return formatStructuredAddress(parseNominatimAddress(data));
}

export async function nominatimForwardSearch(query, limit = 6) {
  const data = await nominatimFetch('/search', {
    q: query,
    format: 'json',
    addressdetails: 1,
    limit,
  });
  if (!Array.isArray(data)) return [];
  return data.map((result) => {
    const address = formatStructuredAddress(parseNominatimAddress(result));
    return {
      lat: String(result.lat ?? ''),
      lon: String(result.lon ?? ''),
      display_name: address.fullLabel,
      mainText: address.street || address.building || result.name || address.shortLabel,
      secondaryText: [address.estate, address.town, address.country].filter(Boolean).join(', '),
      address,
    };
  });
}

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
    fullLabel: address.formattedAddress || lines.join(', ') || GENERIC_FALLBACK,
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
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places autocomplete failed: ${data.status}`);
  }
  return data.predictions || [];
}

export async function googlePlaceDetails(placeId, key) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'formatted_address,geometry,address_components,name,place_id');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== 'OK' || !data.result) {
    throw new Error(`Place details failed: ${data.status}`);
  }
  return data.result;
}
