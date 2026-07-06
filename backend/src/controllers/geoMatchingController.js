/**
 * Geo Matching Controller — API endpoints for geographic matching system
 */
import {
  findNearbyFundis, calculateSurgePricing,
  getGeoControls, updateGeoControls,
  checkBlockedRegion, addBlockedRegion, listBlockedRegions, removeBlockedRegion,
  getServiceRadiusRules, updateServiceRadiusRule,
  getFundiTravelSettings, updateFundiTravelSettings,
  createInternationalBookingRequest, reviewInternationalBooking, listInternationalBookings,
  listGeoZones, createGeoZone,
} from '../services/geoMatchingService.js';

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// ── Smart Matching ─────────────────────────────────────────────
export async function findFundisHandler(req, res) {
  const { latitude, longitude, serviceCategory, isEmergency } = req.body || {};
  if (!latitude || !longitude) throw badRequest('Latitude and longitude required');
  const fundis = await findNearbyFundis({
    latitude: Number(latitude), longitude: Number(longitude),
    serviceCategory, isEmergency: Boolean(isEmergency), customerId: req.user.id,
  });
  res.json({ success: true, count: fundis.length, fundis });
}

// ── Surge Pricing ──────────────────────────────────────────────
export async function surgePricingHandler(req, res) {
  const { basePrice, distanceKm, isEmergency, isNight, fundiId } = req.body || {};
  if (basePrice === undefined || distanceKm === undefined) throw badRequest('basePrice and distanceKm required');
  const pricing = await calculateSurgePricing({
    basePrice: Number(basePrice), distanceKm: Number(distanceKm),
    isEmergency, isNight, fundiId,
  });
  res.json({ success: true, pricing });
}

// ── Geo Controls (CEO) ────────────────────────────────────────
export async function getGeoControlsHandler(_req, res) {
  const controls = await getGeoControls();
  res.json({ success: true, controls });
}

export async function updateGeoControlsHandler(req, res) {
  const result = await updateGeoControls(req.body || {}, req.user.id);
  res.json({ success: true, controls: result });
}

// ── Blocked Regions ───────────────────────────────────────────
export async function listBlockedRegionsHandler(_req, res) {
  const regions = await listBlockedRegions();
  res.json({ success: true, regions });
}

export async function addBlockedRegionHandler(req, res) {
  const { type, value, reason } = req.body || {};
  if (!type || !value) throw badRequest('type and value required');
  const result = await addBlockedRegion(type, value, reason, req.user.id);
  res.status(201).json({ success: true, region: result });
}

export async function removeBlockedRegionHandler(req, res) {
  await removeBlockedRegion(req.params.id, req.user.id);
  res.json({ success: true });
}

// ── Service Radius Rules ──────────────────────────────────────
export async function getServiceRadiusRulesHandler(_req, res) {
  const rules = await getServiceRadiusRules();
  res.json({ success: true, rules });
}

export async function updateServiceRadiusRuleHandler(req, res) {
  const { category, maxRadiusKm, isUnlimited } = req.body || {};
  if (!category) throw badRequest('category required');
  await updateServiceRadiusRule(category, maxRadiusKm, isUnlimited, req.user.id);
  res.json({ success: true });
}

// ── Fundi Travel Settings ─────────────────────────────────────
export async function getTravelSettingsHandler(req, res) {
  const settings = await getFundiTravelSettings(req.user.id);
  res.json({ success: true, settings });
}

export async function updateTravelSettingsHandler(req, res) {
  const result = await updateFundiTravelSettings(req.user.id, req.body || {});
  res.json({ success: true, settings: result });
}

// ── International Bookings ────────────────────────────────────
export async function createIntlBookingHandler(req, res) {
  const result = await createInternationalBookingRequest(req.user.id, req.body || {});
  res.status(201).json({ success: true, booking: result });
}

export async function listIntlBookingsHandler(req, res) {
  const bookings = await listInternationalBookings(req.query.status);
  res.json({ success: true, bookings });
}

export async function reviewIntlBookingHandler(req, res) {
  const { status, reviewNotes } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) throw badRequest('status must be approved or rejected');
  const result = await reviewInternationalBooking(req.params.id, status, reviewNotes, req.user.id);
  res.json({ success: true, booking: result });
}

// ── Geo Zones ─────────────────────────────────────────────────
export async function listGeoZonesHandler(_req, res) {
  const zones = await listGeoZones();
  res.json({ success: true, zones });
}

export async function createGeoZoneHandler(req, res) {
  const result = await createGeoZone(req.body || {}, req.user.id);
  res.status(201).json({ success: true, zone: result });
}
