import { config } from '../config.js';
import { badRequest } from '../utils/http.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function reverseGeocode(req, res) {
  const { latitude, longitude } = req.body || {};
  if (latitude == null || longitude == null) throw badRequest('Latitude and longitude are required');
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.json({
      success: true,
      areaName: `${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}`,
      formattedAddress: null,
      source: 'coordinates',
    });
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`;
  const response = await fetch(url);
  const data = await response.json();
  const result = data.results?.[0];
  res.json({
    success: true,
    areaName: result?.address_components?.find((c) => c.types.includes('sublocality') || c.types.includes('locality'))?.long_name
      || result?.formatted_address
      || `${latitude}, ${longitude}`,
    formattedAddress: result?.formatted_address || null,
    source: 'google',
  });
}

export async function directions(req, res) {
  const { origin, destination, mode = 'driving' } = req.body || {};
  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    throw badRequest('Origin and destination coordinates are required');
  }
  const distanceKm = haversineKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const etaMinutes = Math.max(5, Math.round((distanceKm / 30) * 60));
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.json({
      success: true,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMinutes,
      polyline: null,
      source: 'haversine',
    });
  }
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
  url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  const leg = data.routes?.[0]?.legs?.[0];
  res.json({
    success: true,
    distanceKm: leg ? leg.distance.value / 1000 : Number(distanceKm.toFixed(2)),
    etaMinutes: leg ? Math.ceil(leg.duration.value / 60) : etaMinutes,
    polyline: data.routes?.[0]?.overview_polyline?.points || null,
    source: 'google',
  });
}
