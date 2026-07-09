/**
 * Global Multi-Country Service
 *
 * Handles country configuration, currency conversion, payment methods,
 * verification requirements, and localized pricing for 100+ countries.
 *
 * The CEO can launch new countries from the dashboard — no code changes.
 */

import { query } from '../db.js';

// ── Country cache (5 min TTL) ─────────────────────────────────
let countryCache = new Map();
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadCountries() {
  const now = Date.now();
  if (countryCache.size > 0 && now - cacheTime < CACHE_TTL) {
    return countryCache;
  }
  const result = await query('SELECT * FROM countries WHERE is_active = true');
  countryCache = new Map(result.rows.map(c => [c.code, c]));
  cacheTime = now;
  return countryCache;
}

// ── Get country configuration ─────────────────────────────────
export async function getCountryConfig(countryCode) {
  const countries = await loadCountries();
  return countries.get(countryCode) || countries.get('KE'); // fallback to Kenya
}

// ── List all active countries ─────────────────────────────────
export async function listActiveCountries() {
  const countries = await loadCountries();
  return Array.from(countries.values());
}

// ── Launch a new country (CEO only) ───────────────────────────
export async function launchCountry(config) {
  const {
    code, name, currencyCode, currencySymbol, currencyName,
    phoneCode, timezone, defaultLanguage, flagEmoji,
    vatPercent = 0, vatName = 'VAT',
  } = config;

  if (!code || !name || !currencyCode) {
    throw new Error('Country code, name, and currency code are required');
  }

  const result = await query(
    `INSERT INTO countries (code, name, currency_code, currency_symbol, currency_name,
      phone_code, timezone, default_language, flag_emoji, vat_percent, vat_name,
      is_active, launched_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now(),$12)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       currency_code = EXCLUDED.currency_code,
       currency_symbol = EXCLUDED.currency_symbol,
       currency_name = EXCLUDED.currency_name,
       phone_code = EXCLUDED.phone_code,
       timezone = EXCLUDED.timezone,
       default_language = EXCLUDED.default_language,
       flag_emoji = EXCLUDED.flag_emoji,
       vat_percent = EXCLUDED.vat_percent,
       vat_name = EXCLUDED.vat_name,
       is_active = true,
       launched_at = COALESCE(countries.launched_at, now()),
       updated_at = now()
     RETURNING *`,
    [code.toUpperCase(), name, currencyCode.toUpperCase(), currencySymbol, currencyName,
     phoneCode, timezone, defaultLanguage || 'en', flagEmoji || null,
     vatPercent, vatName, config.createdBy || null],
  );

  // Invalidate cache
  countryCache.clear();
  return result.rows[0];
}

// ── Get payment methods for a country ─────────────────────────
export async function getCountryPaymentMethods(countryCode) {
  const result = await query(
    `SELECT * FROM country_payment_methods
     WHERE country_code = $1 AND is_active = true
     ORDER BY display_order`,
    [countryCode],
  );
  return result.rows;
}

// ── Get verification requirements for a country ───────────────
export async function getCountryVerificationRequirements(countryCode) {
  const result = await query(
    `SELECT * FROM country_verification_requirements
     WHERE country_code = $1
     ORDER BY display_order`,
    [countryCode],
  );
  return result.rows;
}

// ── Get emergency contacts for a country ──────────────────────
export async function getCountryEmergencyContacts(countryCode) {
  const result = await query(
    'SELECT * FROM country_emergency_contacts WHERE country_code = $1',
    [countryCode],
  );
  return result.rows;
}

// ── Get country pricing config ────────────────────────────────
export async function getCountryPricingConfig(countryCode) {
  const result = await query(
    'SELECT * FROM country_pricing_config WHERE country_code = $1',
    [countryCode],
  );
  if (result.rows[0]) return result.rows[0];

  // Fallback to Kenya config
  const fallback = await query(
    'SELECT * FROM country_pricing_config WHERE country_code = $1',
    ['KE'],
  );
  return fallback.rows[0];
}

// ── Get country service categories ────────────────────────────
export async function getCountryServiceCategories(countryCode) {
  const result = await query(
    `SELECT * FROM country_service_categories
     WHERE country_code = $1 AND is_available = true
     ORDER BY service_category`,
    [countryCode],
  );
  return result.rows;
}

// ── Currency conversion ───────────────────────────────────────
export async function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;

  // Try direct rate
  const direct = await query(
    `SELECT rate FROM exchange_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY fetched_at DESC LIMIT 1`,
    [fromCurrency, toCurrency],
  );
  if (direct.rows[0]) return amount * Number(direct.rows[0].rate);

  // Try reverse rate
  const reverse = await query(
    `SELECT rate FROM exchange_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY fetched_at DESC LIMIT 1`,
    [toCurrency, fromCurrency],
  );
  if (reverse.rows[0]) return amount / Number(reverse.rows[0].rate);

  // Try via USD
  const toUsd = await query(
    `SELECT rate FROM exchange_rates
     WHERE from_currency = $1 AND to_currency = 'USD'
     ORDER BY fetched_at DESC LIMIT 1`,
    [fromCurrency],
  );
  const fromUsd = await query(
    `SELECT rate FROM exchange_rates
     WHERE from_currency = 'USD' AND to_currency = $1
     ORDER BY fetched_at DESC LIMIT 1`,
    [toCurrency],
  );

  if (toUsd.rows[0] && fromUsd.rows[0]) {
    return amount * Number(toUsd.rows[0].rate) * Number(fromUsd.rows[0].rate);
  }

  // No rate found — return original amount
  return amount;
}

// ── Get all exchange rates ────────────────────────────────────
export async function getExchangeRates(baseCurrency = 'KES') {
  const result = await query(
    `SELECT DISTINCT ON (to_currency) to_currency, rate, fetched_at
     FROM exchange_rates
     WHERE from_currency = $1
     ORDER BY to_currency, fetched_at DESC`,
    [baseCurrency],
  );
  return result.rows;
}

// ── Update exchange rates (from external API) ─────────────────
export async function updateExchangeRates(rates, source = 'manual') {
  for (const [pair, rate] of Object.entries(rates)) {
    const [from, to] = pair.split('/');
    await query(
      `INSERT INTO exchange_rates (from_currency, to_currency, rate, source, fetched_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (from_currency, to_currency, fetched_at::date)
       DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source`,
      [from, to, rate, source],
    );
  }
}

// ── Get available languages ───────────────────────────────────
export async function getLanguages() {
  const result = await query('SELECT * FROM languages WHERE is_active = true ORDER BY name');
  return result.rows;
}

// ── Get translations for a language ───────────────────────────
export async function getTranslations(languageCode) {
  const result = await query(
    'SELECT key, value FROM translations WHERE language_code = $1',
    [languageCode],
  );
  const translations = {};
  for (const row of result.rows) {
    translations[row.key] = row.value;
  }
  return translations;
}

// ── Detect country from phone number ──────────────────────────
export async function detectCountryFromPhone(phone) {
  const countries = await loadCountries();
  for (const [code, country] of countries) {
    if (phone.startsWith(country.phone_code.replace('+', ''))) {
      return code;
    }
  }
  return 'KE'; // default to Kenya
}

// ── Format amount with country currency ───────────────────────
export async function formatCurrency(amount, countryCode) {
  const country = await getCountryConfig(countryCode);
  const symbol = country?.currency_symbol || 'KSh';
  const rounded = Math.round(amount);
  return `${symbol} ${rounded.toLocaleString()}`;
}

// ── Global analytics ──────────────────────────────────────────
export async function getGlobalAnalytics(dateRange = 30) {
  const result = await query(
    `SELECT
       c.code, c.name, c.flag_emoji, c.currency_code,
       COUNT(DISTINCT j.id) as total_jobs,
       COUNT(DISTINCT CASE WHEN j.status = 'completed' THEN j.id END) as completed_jobs,
       COALESCE(SUM(j.final_price), 0) as revenue,
       COUNT(DISTINCT j.customer_id) as active_customers,
       COUNT(DISTINCT j.fundi_id) as active_fundis
     FROM countries c
     LEFT JOIN jobs j ON j.country_code = c.code
       AND j.created_at > now() - ($1 || ' days')::interval
     WHERE c.is_active = true
     GROUP BY c.code, c.name, c.flag_emoji, c.currency_code
     ORDER BY revenue DESC`,
    [String(dateRange)],
  );
  return result.rows;
}
