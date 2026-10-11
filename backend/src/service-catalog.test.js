import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { query } from './db.js';
import {
  createServiceCategory,
  deactivateServiceCategory,
  getPublicServiceCategories,
  listManagedServiceCategories,
  resolvePublicServiceCategory,
  updateServiceCategory,
} from './services/serviceCatalogService.js';

test.before(async () => {
  await ensureDevDatabase();
});

test('Kenya service catalog is database-backed and includes the supported core services', async () => {
  const services = await getPublicServiceCategories('KE');
  const slugs = new Set(services.map((service) => service.slug));
  for (const slug of ['plumbing', 'electrical', 'hvac', 'cleaning', 'auto-repair', 'carpentry', 'painting', 'general-repairs', 'appliance-repair', 'cctv-security', 'internet-wifi', 'construction-renovation', 'landscaping', 'pest-control', 'moving', 'other']) {
    assert.ok(slugs.has(slug), `expected the Kenya catalog to contain ${slug}`);
  }
  assert.equal((await getPublicServiceCategories('KE', 'Wi-Fi')).some((service) => service.slug === 'internet-wifi'), true);
  assert.equal((await getPublicServiceCategories('ZZ')).length, 0);
});

test('unlisted service text resolves to Other and remains quote-required', async () => {
  const resolved = await resolvePublicServiceCategory('KE', 'rooftop rainwater pump service');
  assert.equal(resolved.slug, 'other');
  assert.equal(resolved.requestedService, 'rooftop rainwater pump service');
  assert.equal(resolved.pricingMode, 'quote_required');
  assert.equal(resolved.basePrice, null);
});

test('catalog changes are transactionally audited and country availability is scoped', async () => {
  const slug = `test-service-${Date.now()}`;
  const created = await createServiceCategory({
    slug,
    title: 'Test Service',
    description: 'Catalog regression fixture',
    icon: 'construct',
    color: '#123456',
    aliases: ['fixture work'],
    sortOrder: 9000,
    countryCode: 'KE',
    displayName: 'Test Service',
    isAvailable: true,
    pricingMode: 'quote_required',
    basePrice: 900,
    minimumPrice: 500,
    maximumPrice: 1500,
    estimatedDurationMinutes: 60,
  }, null);
  assert.equal(created.slug, slug);
  assert.equal(created.pricingMode, 'quote_required');
  assert.equal(created.basePrice, null);
  assert.equal((await getPublicServiceCategories('KE', 'fixture work')).some((service) => service.slug === slug), true);
  assert.equal((await getPublicServiceCategories('ZZ')).some((service) => service.slug === slug), false);

  await updateServiceCategory(slug, { countryCode: 'KE', isAvailable: false, basePrice: 1000 }, null);
  assert.equal((await getPublicServiceCategories('KE')).some((service) => service.slug === slug), false);
  const managed = await listManagedServiceCategories({ countryCode: 'KE', search: slug, includeInactive: true });
  assert.equal(managed[0]?.isAvailable, false);

  const audit = await query(
    `SELECT action FROM audit_logs WHERE entity_type='service_category' AND entity_id=$1 ORDER BY created_at`,
    [created.id],
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ['service_category.created', 'service_category.updated']);

  await deactivateServiceCategory(slug, null);
  assert.equal((await getPublicServiceCategories('KE')).some((service) => service.slug === slug), false);
  const inactive = await listManagedServiceCategories({ countryCode: 'KE', search: slug, includeInactive: true });
  assert.equal(inactive[0]?.isActive, false);
});

test('invalid service fields are rejected before changing the database', async () => {
  await assert.rejects(
    createServiceCategory({ slug: 'Bad Slug', title: 'Invalid', basePrice: 900, minimumPrice: 1000, maximumPrice: 1500 }, null),
    (error) => error.status === 400,
  );
  await assert.rejects(
    updateServiceCategory('plumbing', { countryCode: 'KE', pricingMode: 'automatic', minimumPrice: 900, basePrice: 800, maximumPrice: 1500 }, null),
    (error) => error.status === 400,
  );
  await assert.rejects(
    createServiceCategory({ slug: `bad-color-${Date.now()}`, title: 'Invalid Color', color: 'url(javascript:alert(1))' }, null),
    (error) => error.status === 400,
  );
});
