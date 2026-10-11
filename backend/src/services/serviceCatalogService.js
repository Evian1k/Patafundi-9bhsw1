import { query, transaction } from '../db.js';
import { badRequest, conflict, notFound } from '../utils/http.js';

const SLUG_RE = /^[a-z](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanText(value, field, max, { optional = false } = {}) {
  if (value == null && optional) return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  const text = value.trim();
  if (!text && optional) return null;
  if (!text || text.length > max) throw badRequest(`${field} must be between 1 and ${max} characters`);
  return text;
}

function numberField(value, field, { min = 0, max = 100000000, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw badRequest(`${field} is outside the supported range`);
  }
  return number;
}

function boolField(value, field) {
  if (typeof value !== 'boolean') throw badRequest(`${field} must be true or false`);
  return value;
}

function normalizeAliases(value) {
  if (!Array.isArray(value) || value.length > 30) throw badRequest('aliases must be an array of at most 30 entries');
  const aliases = [...new Set(value.map((item) => cleanText(item, 'alias', 80).toLowerCase()))];
  return aliases;
}

function normalizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw badRequest('slug must use lowercase letters, numbers, underscores, or hyphens');
  return slug;
}

function normalizeCountryCode(value) {
  const countryCode = String(value || 'KE').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw badRequest('countryCode must be a two-letter country code');
  return countryCode;
}

function mapped(row) {
  if (!row) return null;
  const pricingMode = row.pricing_mode === 'automatic' ? 'automatic' : 'quote_required';
  return {
    id: row.id,
    slug: row.slug,
    title: row.display_name || row.title,
    label: row.display_name || row.title,
    name: row.display_name || row.title,
    canonicalTitle: row.title,
    displayName: row.display_name || row.title,
    description: row.description,
    icon: row.icon,
    color: row.color,
    aliases: row.aliases || [],
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    countryCode: row.country_code || null,
    isAvailable: Boolean(row.is_available),
    pricingMode,
    basePrice: pricingMode === 'quote_required' || row.base_price == null ? null : Number(row.base_price),
    minimumPrice: pricingMode === 'quote_required' || row.minimum_price == null ? null : Number(row.minimum_price),
    maximumPrice: pricingMode === 'quote_required' || row.maximum_price == null ? null : Number(row.maximum_price),
    estimatedDurationMinutes: pricingMode === 'quote_required' || row.estimated_duration_minutes == null ? null : Number(row.estimated_duration_minutes),
    updatedAt: row.updated_at || null,
  };
}

const SELECT_ADMIN = `
  SELECT s.id, s.slug, s.title, s.description, s.icon, s.color, s.aliases,
         s.sort_order, s.is_active, s.updated_at,
         c.country_code, c.display_name, c.is_available, c.pricing_mode, c.base_price,
         c.minimum_price, c.maximum_price, c.estimated_duration_minutes
  FROM service_categories s
  LEFT JOIN country_service_categories c
    ON c.service_category = s.slug AND c.country_code = $1
`;

export async function listManagedServiceCategories({ countryCode = 'KE', search = '', includeInactive = true } = {}) {
  const code = normalizeCountryCode(countryCode);
  const values = [code];
  const clauses = [];
  if (!includeInactive) clauses.push('s.is_active = true');
  const q = String(search || '').trim().slice(0, 100);
  if (q) {
    values.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    clauses.push(`(s.title ILIKE $2 ESCAPE '\\' OR s.slug ILIKE $2 ESCAPE '\\' OR COALESCE(s.description, '') ILIKE $2 ESCAPE '\\' OR array_to_string(s.aliases, ' ') ILIKE $2 ESCAPE '\\' OR COALESCE(c.display_name, '') ILIKE $2 ESCAPE '\\')`);
  }
  const result = await query(`${SELECT_ADMIN}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY s.sort_order, s.title LIMIT 250`, values);
  return result.rows.map(mapped);
}

export async function getPublicServiceCategories(countryCode, search = '') {
  const code = normalizeCountryCode(countryCode);
  const values = [code];
  let searchClause = '';
  const q = String(search || '').trim().slice(0, 100);
  if (q) {
    values.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    searchClause = ` AND (s.title ILIKE $2 ESCAPE '\\' OR s.slug ILIKE $2 ESCAPE '\\' OR COALESCE(s.description, '') ILIKE $2 ESCAPE '\\' OR array_to_string(s.aliases, ' ') ILIKE $2 ESCAPE '\\' OR COALESCE(c.display_name, '') ILIKE $2 ESCAPE '\\')`;
  }
  const result = await query(
    `SELECT s.id, s.slug, s.title, s.description, s.icon, s.color, s.aliases, s.sort_order, s.is_active,
            c.country_code, c.display_name, c.is_available, c.pricing_mode, c.base_price, c.minimum_price,
            c.maximum_price, c.estimated_duration_minutes, c.updated_at
     FROM service_categories s
     JOIN country_service_categories c ON c.service_category = s.slug
     JOIN countries country ON country.code = c.country_code AND country.is_active = true
     WHERE s.is_active = true AND c.country_code = $1 AND c.is_available = true${searchClause}
     ORDER BY s.sort_order, COALESCE(c.display_name, s.title)
     LIMIT 100`,
    values,
  );
  return result.rows.map(mapped);
}

export async function resolvePublicServiceCategory(countryCode, input) {
  const requested = typeof input === 'string' ? input.trim() : '';
  if (!requested || requested.length > 100) throw badRequest('Service category must be text of at most 100 characters');
  const services = await getPublicServiceCategories(countryCode);
  const normalized = requested.toLowerCase();
  const exact = services.find((service) => [service.slug, service.title, service.label, ...service.aliases]
    .some((value) => value.toLowerCase() === normalized));
  if (exact) return { ...exact, requestedService: null };
  const other = services.find((service) => service.slug === 'other');
  return other ? { ...other, requestedService: requested } : null;
}

function mergePayload(input, current = null, { create = false } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const get = (key, fallback) => body[key] === undefined ? fallback : body[key];
  const slug = normalizeSlug(body.slug ?? current?.slug);
  const countryCode = normalizeCountryCode(get('countryCode', current?.country_code || 'KE'));
  const title = cleanText(get('title', current?.title), 'title', 80);
  const description = cleanText(get('description', current?.description), 'description', 500, { optional: true });
  const icon = cleanText(get('icon', current?.icon || 'construct'), 'icon', 64);
  const colorValue = get('color', current?.color || '#1E9E8A');
  const color = colorValue == null || colorValue === '' ? null : String(colorValue).trim();
  if (color && !HEX_COLOR_RE.test(color)) throw badRequest('color must be a six-digit hex color');
  const sortOrder = numberField(get('sortOrder', current?.sort_order ?? 0), 'sortOrder', { min: 0, max: 100000, integer: true });
  const isActive = boolField(get('isActive', current?.is_active ?? true), 'isActive');
  const aliasesInput = get('aliases', current?.aliases || []);
  const aliases = normalizeAliases(aliasesInput);
  const displayName = cleanText(get('displayName', current?.display_name ?? title), 'displayName', 80);
  const isAvailable = boolField(get('isAvailable', current?.is_available ?? true), 'isAvailable');
  const pricingMode = get('pricingMode', current?.pricing_mode || 'quote_required');
  if (!['automatic', 'quote_required'].includes(pricingMode)) throw badRequest('pricingMode must be automatic or quote_required');
  const minimumPrice = pricingMode === 'quote_required' ? (current?.minimum_price == null ? null : Number(current.minimum_price)) : numberField(get('minimumPrice', current?.minimum_price), 'minimumPrice', { min: 0.01, max: 100000000 });
  const basePrice = pricingMode === 'quote_required' ? (current?.base_price == null ? null : Number(current.base_price)) : numberField(get('basePrice', current?.base_price), 'basePrice', { min: 0.01, max: 100000000 });
  const maximumPrice = pricingMode === 'quote_required' ? (current?.maximum_price == null ? null : Number(current.maximum_price)) : numberField(get('maximumPrice', current?.maximum_price), 'maximumPrice', { min: 0.01, max: 100000000 });
  if (pricingMode === 'automatic' && (minimumPrice == null || basePrice == null || maximumPrice == null || minimumPrice > basePrice || basePrice > maximumPrice)) {
    throw badRequest('Automatic prices must satisfy 0 < minimumPrice ≤ basePrice ≤ maximumPrice');
  }
  const estimatedDurationMinutes = pricingMode === 'quote_required'
    ? (current?.estimated_duration_minutes == null ? null : Number(current.estimated_duration_minutes))
    : numberField(get('estimatedDurationMinutes', current?.estimated_duration_minutes ?? 60), 'estimatedDurationMinutes', { min: 15, max: 1440, integer: true });
  if (create && body.title == null) throw badRequest('title is required');
  return { slug, countryCode, title, description, icon, color, sortOrder, isActive, aliases, displayName, isAvailable, pricingMode, basePrice, minimumPrice, maximumPrice, estimatedDurationMinutes };
}

async function requireAutomaticPricing(client, data) {
  if (data.pricingMode !== 'automatic') return;
  if (data.countryCode !== 'KE') throw badRequest('Automatic pricing is not configured for this country; use provider quotes until a local-currency price engine is enabled');
  const result = await client.query('SELECT 1 FROM service_pricing WHERE service_category=$1 AND is_active=true LIMIT 1', [data.slug]);
  if (!result.rows[0]) throw badRequest('Automatic pricing cannot be enabled without an active price-engine schedule for this service');
}

async function audit(client, { userId, action, service, before, after }) {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'service_category', $3, $4::jsonb)`,
    [userId, action, service.id, JSON.stringify({ slug: service.slug, before, after })],
  );
}

function snapshot(canonical, country) {
  return {
    title: canonical.title,
    description: canonical.description,
    icon: canonical.icon,
    color: canonical.color,
    sortOrder: Number(canonical.sort_order),
    isActive: canonical.is_active,
    countryCode: country?.country_code || null,
    displayName: country?.display_name || null,
    isAvailable: country?.is_available ?? null,
    pricingMode: country?.pricing_mode || null,
    basePrice: country?.base_price == null ? null : Number(country.base_price),
    minimumPrice: country?.minimum_price == null ? null : Number(country.minimum_price),
    maximumPrice: country?.maximum_price == null ? null : Number(country.maximum_price),
  };
}

async function upsertCountry(client, data) {
  const result = await client.query(
    `INSERT INTO country_service_categories
       (country_code, service_category, is_available, pricing_mode, base_price, minimum_price, maximum_price, estimated_duration_minutes, display_name, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (country_code, service_category) DO UPDATE SET
       is_available = EXCLUDED.is_available,
       pricing_mode = EXCLUDED.pricing_mode,
       base_price = EXCLUDED.base_price,
       minimum_price = EXCLUDED.minimum_price,
       maximum_price = EXCLUDED.maximum_price,
       estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
       display_name = EXCLUDED.display_name,
       updated_at = now()
     RETURNING *`,
    [data.countryCode, data.slug, data.isAvailable, data.pricingMode, data.basePrice, data.minimumPrice, data.maximumPrice, data.estimatedDurationMinutes, data.displayName],
  );
  return result.rows[0];
}

export async function createServiceCategory(input, userId) {
  const data = mergePayload(input, null, { create: true });
  return transaction(async (client) => {
    const countryExists = await client.query('SELECT 1 FROM countries WHERE code=$1', [data.countryCode]);
    if (!countryExists.rows[0]) throw badRequest('Country must be configured before enabling a service');
    await requireAutomaticPricing(client, data);
    const inserted = await client.query(
      `INSERT INTO service_categories (slug, title, description, icon, color, aliases, sort_order, is_active, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (slug) DO NOTHING RETURNING *`,
      [data.slug, data.title, data.description, data.icon, data.color, data.aliases, data.sortOrder, data.isActive, userId],
    );
    if (!inserted.rows[0]) throw conflict('A service with this slug already exists');
    const country = await upsertCountry(client, data);
    const after = snapshot(inserted.rows[0], country);
    await audit(client, { userId, action: 'service_category.created', service: inserted.rows[0], before: null, after });
    return mapped({
      ...country,
      ...inserted.rows[0],
      country_code: country.country_code,
      display_name: country.display_name,
      is_available: country.is_available,
      base_price: country.base_price,
      minimum_price: country.minimum_price,
      maximum_price: country.maximum_price,
      estimated_duration_minutes: country.estimated_duration_minutes,
      updated_at: country.updated_at,
    });
  });
}

export async function updateServiceCategory(slugInput, input, userId) {
  const slug = normalizeSlug(slugInput);
  return transaction(async (client) => {
    const currentResult = await client.query('SELECT * FROM service_categories WHERE slug = $1 FOR UPDATE', [slug]);
    const current = currentResult.rows[0];
    if (!current) throw notFound('Service category not found');
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const countryCode = normalizeCountryCode(body.countryCode || 'KE');
    const countryExists = await client.query('SELECT 1 FROM countries WHERE code=$1', [countryCode]);
    if (!countryExists.rows[0]) throw badRequest('Country must be configured before enabling a service');
    const countryResult = await client.query(
      'SELECT * FROM country_service_categories WHERE country_code = $1 AND service_category = $2 FOR UPDATE',
      [countryCode, slug],
    );
    const countryCurrent = countryResult.rows[0] || { country_code: countryCode, display_name: current.title, is_available: false, pricing_mode: 'quote_required', base_price: null, minimum_price: null, maximum_price: null, estimated_duration_minutes: null };
    const mergedInput = { ...body, slug, countryCode };
    const data = mergePayload(mergedInput, { ...current, ...countryCurrent });
    await requireAutomaticPricing(client, data);
    const updated = await client.query(
      `UPDATE service_categories SET title=$2, description=$3, icon=$4, color=$5, aliases=$6,
         sort_order=$7, is_active=$8, updated_by=$9, updated_at=now()
       WHERE slug=$1 RETURNING *`,
      [slug, data.title, data.description, data.icon, data.color, data.aliases, data.sortOrder, data.isActive, userId],
    );
    const country = await upsertCountry(client, data);
    const before = snapshot(current, countryResult.rows[0]);
    const after = snapshot(updated.rows[0], country);
    await audit(client, { userId, action: 'service_category.updated', service: updated.rows[0], before, after });
    return mapped({
      ...country,
      ...updated.rows[0],
      country_code: country.country_code,
      display_name: country.display_name,
      is_available: country.is_available,
      pricing_mode: country.pricing_mode,
      base_price: country.base_price,
      minimum_price: country.minimum_price,
      maximum_price: country.maximum_price,
      estimated_duration_minutes: country.estimated_duration_minutes,
      updated_at: country.updated_at,
    });
  });
}

export async function deactivateServiceCategory(slugInput, userId) {
  const slug = normalizeSlug(slugInput);
  return transaction(async (client) => {
    const currentResult = await client.query('SELECT * FROM service_categories WHERE slug = $1 FOR UPDATE', [slug]);
    const current = currentResult.rows[0];
    if (!current) throw notFound('Service category not found');
    const before = snapshot(current, null);
    const updated = await client.query(
      'UPDATE service_categories SET is_active=false, updated_by=$2, updated_at=now() WHERE slug=$1 RETURNING *',
      [slug, userId],
    );
    await audit(client, { userId, action: 'service_category.deactivated', service: updated.rows[0], before, after: snapshot(updated.rows[0], null) });
    return { slug, isActive: false };
  });
}

export { normalizeSlug, normalizeCountryCode };
