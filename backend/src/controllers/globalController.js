/**
 * Global Controller — multi-country management APIs.
 *
 * Endpoints:
 *   GET  /api/global/countries              — list all active countries
 *   GET  /api/global/countries/:code        — get country config
 *   POST /api/global/countries              — launch new country (admin)
 *   PUT  /api/global/countries/:code        — update country (admin)
 *   GET  /api/global/payments/:countryCode  — payment methods for country
 *   GET  /api/global/verification/:countryCode — verification requirements
 *   GET  /api/global/emergency/:countryCode — emergency contacts
 *   GET  /api/global/pricing/:countryCode   — pricing config
 *   GET  /api/global/services/:countryCode  — available service categories
 *   GET  /api/global/languages              — available languages
 *   GET  /api/global/translations/:lang     — translations
 *   GET  /api/global/exchange-rates         — exchange rates
 *   POST /api/global/exchange-rates         — update rates (admin)
 *   GET  /api/global/analytics              — global analytics (admin)
 *   GET  /api/global/dashboard              — CEO global dashboard (admin)
 *   GET  /api/global/detect-country         — detect country from phone
 */

import {
  listActiveCountries, getCountryConfig, launchCountry,
  getCountryPaymentMethods, getCountryVerificationRequirements,
  getCountryEmergencyContacts, getCountryPricingConfig,
  getCountryServiceCategories, convertCurrency, getExchangeRates,
  updateExchangeRates, getLanguages, getTranslations,
  detectCountryFromPhone, formatCurrency, getGlobalAnalytics,
} from '../services/globalService.js';
import { query } from '../db.js';
import { badRequest } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

export async function listCountries(_req, res) {
  const countries = await listActiveCountries();
  res.json({ success: true, countries });
}

export async function getCountry(req, res) {
  const country = await getCountryConfig(req.params.code);
  if (!country) return res.status(404).json({ success: false, message: 'Country not found' });
  const [payments, verification, emergency, pricing, services] = await Promise.all([
    getCountryPaymentMethods(country.code),
    getCountryVerificationRequirements(country.code),
    getCountryEmergencyContacts(country.code),
    getCountryPricingConfig(country.code),
    getCountryServiceCategories(country.code),
  ]);
  res.json({ success: true, country, payments, verification, emergency, pricing, services });
}

export async function createCountry(req, res) {
  const country = await launchCountry({ ...req.body, createdBy: req.user.id });
  await auditLog({
    userId: req.user.id,
    action: 'country.launched',
    entityType: 'country',
    entityId: country.id,
    metadata: { code: country.code, name: country.name },
  });
  res.status(201).json({ success: true, country });
}

export async function updateCountry(req, res) {
  const { code } = req.params;
  const fields = ['name', 'currency_code', 'currency_symbol', 'currency_name', 'phone_code',
    'timezone', 'default_language', 'flag_emoji', 'vat_percent', 'vat_name', 'is_active'];
  const setClauses = [];
  const values = [];
  let idx = 1;
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      setClauses.push(`${field} = $${idx}`);
      values.push(req.body[field]);
      idx++;
    }
  }
  if (setClauses.length === 0) throw badRequest('No fields to update');
  setClauses.push(`updated_at = now()`);
  values.push(code);
  const result = await query(
    `UPDATE countries SET ${setClauses.join(', ')} WHERE code = $${idx} RETURNING *`,
    values,
  );
  if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Country not found' });
  await auditLog({ userId: req.user.id, action: 'country.updated', entityType: 'country', entityId: result.rows[0].id, metadata: { code } });
  res.json({ success: true, country: result.rows[0] });
}

export async function getPaymentMethods(req, res) {
  const methods = await getCountryPaymentMethods(req.params.countryCode);
  res.json({ success: true, paymentMethods: methods });
}

export async function getVerificationReqs(req, res) {
  const reqs = await getCountryVerificationRequirements(req.params.countryCode);
  res.json({ success: true, requirements: reqs });
}

export async function getEmergencyContacts(req, res) {
  const contacts = await getCountryEmergencyContacts(req.params.countryCode);
  res.json({ success: true, contacts });
}

export async function getPricingConfig(req, res) {
  const pricing = await getCountryPricingConfig(req.params.countryCode);
  res.json({ success: true, pricing });
}

export async function getCountryServices(req, res) {
  const services = await getCountryServiceCategories(req.params.countryCode);
  res.json({ success: true, services });
}

export async function listLanguages(_req, res) {
  const languages = await getLanguages();
  res.json({ success: true, languages });
}

export async function getTranslationsForLang(req, res) {
  const translations = await getTranslations(req.params.lang);
  res.json({ success: true, translations });
}

export async function getRates(req, res) {
  const base = req.query.base || 'KES';
  const rates = await getExchangeRates(base);
  res.json({ success: true, base, rates });
}

export async function updateRates(req, res) {
  const { rates, source = 'manual' } = req.body;
  if (!rates) throw badRequest('Rates object is required');
  await updateExchangeRates(rates, source);
  await auditLog({ userId: req.user.id, action: 'exchange_rates.updated', entityType: 'exchange_rates', entityId: null, metadata: { source, count: Object.keys(rates).length } });
  res.json({ success: true, updated: Object.keys(rates).length });
}

export async function convertAmount(req, res) {
  const { amount, from, to } = req.query;
  if (!amount || !from || !to) throw badRequest('amount, from, and to are required');
  const converted = await convertCurrency(Number(amount), from, to);
  res.json({ success: true, original: Number(amount), from, to, converted });
}

export async function getAnalytics(req, res) {
  const days = parseInt(req.query.days) || 30;
  const analytics = await getGlobalAnalytics(days);
  res.json({ success: true, analytics });
}

export async function getGlobalDashboard(req, res) {
  const [countries, analytics] = await Promise.all([
    listActiveCountries(),
    getGlobalAnalytics(30),
  ]);

  // Aggregate totals
  const totalRevenue = analytics.reduce((sum, c) => sum + Number(c.revenue || 0), 0);
  const totalJobs = analytics.reduce((sum, c) => sum + Number(c.total_jobs || 0), 0);
  const totalCompleted = analytics.reduce((sum, c) => sum + Number(c.completed_jobs || 0), 0);
  const totalCustomers = analytics.reduce((sum, c) => sum + Number(c.active_customers || 0), 0);
  const totalFundis = analytics.reduce((sum, c) => sum + Number(c.active_fundis || 0), 0);

  // Convert revenue to USD for comparison
  const revenueUsd = await convertCurrency(totalRevenue, 'KES', 'USD');

  res.json({
    success: true,
    dashboard: {
      totalCountries: countries.length,
      totalRevenue,
      revenueUsd: Math.round(revenueUsd),
      totalJobs,
      totalCompleted,
      totalCustomers,
      totalFundis,
      countries: analytics,
    },
  });
}

export async function detectCountry(req, res) {
  const { phone } = req.query;
  if (!phone) throw badRequest('Phone number is required');
  const countryCode = await detectCountryFromPhone(phone);
  const country = await getCountryConfig(countryCode);
  res.json({ success: true, countryCode, country });
}
