import { badRequest } from '../utils/http.js';
import {
  formatStructuredAddress,
  googlePlaceDetails,
  googlePlacesAutocomplete,
  googleReverseGeocode,
  parseGoogleAddress,
} from '../utils/geocoding.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapsKey() {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

export async function reverseGeocode(req, res) {
  const { latitude, longitude } = req.body || {};
  if (latitude == null || longitude == null) throw badRequest('Latitude and longitude are required');

  const key = mapsKey();
  if (!key) {
    return res.status(503).json({
      success: false,
      source: 'not_configured',
      message: 'Google Maps is not configured for reverse geocoding',
    });
  }

  try {
    const address = await googleReverseGeocode(latitude, longitude, key);
    res.json({
      success: true,
      address,
      areaName: address.shortLabel,
      formattedAddress: address.formattedAddress || address.fullLabel,
      source: 'google',
    });
  } catch (err) {
    console.error('[maps] reverse geocode failed:', err);
    res.status(502).json({
      success: false,
      message: 'Could not resolve coordinates to an address',
      source: 'google',
    });
  }
}

export async function search(req, res) {
  const q = String(req.query.q || req.body?.q || '').trim();
  if (!q) throw badRequest('Search query is required');
  const key = mapsKey();
  if (!key) {
    return res.json({ success: true, results: [], source: 'not_configured' });
  }

  try {
    const predictions = await googlePlacesAutocomplete(q, key);
    const top = predictions.slice(0, 6);
    const results = [];

    for (const prediction of top) {
      try {
        const place = await googlePlaceDetails(prediction.place_id, key);
        const address = formatStructuredAddress(parseGoogleAddress(place));
        results.push({
          placeId: prediction.place_id,
          lat: String(place.geometry?.location?.lat ?? ''),
          lon: String(place.geometry?.location?.lng ?? ''),
          display_name: place.formatted_address || prediction.description,
          mainText: prediction.structured_formatting?.main_text || prediction.description,
          secondaryText: prediction.structured_formatting?.secondary_text || '',
          address,
        });
      } catch (detailErr) {
        console.warn('[maps] place details skipped:', prediction.place_id, detailErr?.message);
      }
    }

    if (results.length) {
      return res.json({ success: true, results, source: 'google_places' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', q);
    url.searchParams.set('key', key);
    const response = await fetch(url);
    const data = await response.json();
    const geocodeResults = (data.results || []).slice(0, 5).map((result) => {
      const address = formatStructuredAddress(parseGoogleAddress(result));
      return {
        lat: String(result.geometry?.location?.lat ?? ''),
        lon: String(result.geometry?.location?.lng ?? ''),
        display_name: address.fullLabel,
        address,
      };
    });
    return res.json({ success: true, results: geocodeResults, source: 'google_geocode' });
  } catch (err) {
    console.error('[maps] search failed:', err);
    res.json({ success: true, results: [], source: 'error' });
  }
}

export async function directions(req, res) {
  const { origin, destination, mode = 'driving' } = req.body || {};
  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    throw badRequest('Origin and destination coordinates are required');
  }
  const distanceKm = haversineKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const etaMinutes = Math.max(5, Math.round((distanceKm / 30) * 60));
  const key = mapsKey();
  if (!key) {
    return res.json({
      success: true,
      distanceKm: Number(distanceKm.toFixed(2)),
      distanceMeters: Math.round(distanceKm * 1000),
      etaMinutes,
      etaSeconds: etaMinutes * 60,
      polyline: null,
      steps: [],
      source: 'haversine',
    });
  }
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
  url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('departure_time', 'now');
  url.searchParams.set('traffic_model', 'best_guess');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  const durationSeconds = leg?.duration_in_traffic?.value || leg?.duration?.value || etaMinutes * 60;
  const steps = (leg?.steps || []).map((step) => ({
    instruction: step.html_instructions?.replace(/<[^>]+>/g, '') || '',
    distanceMeters: step.distance?.value || 0,
    durationSeconds: step.duration?.value || 0,
    maneuver: step.maneuver || null,
    endLocation: {
      latitude: step.end_location?.lat,
      longitude: step.end_location?.lng,
    },
  }));

  res.json({
    success: true,
    distanceKm: leg ? leg.distance.value / 1000 : Number(distanceKm.toFixed(2)),
    distanceMeters: leg?.distance?.value || Math.round(distanceKm * 1000),
    etaMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    etaSeconds: durationSeconds,
    polyline: route?.overview_polyline?.points || null,
    steps,
    source: 'google',
  });
}
