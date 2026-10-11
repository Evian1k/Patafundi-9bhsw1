import {
  createServiceCategory,
  deactivateServiceCategory,
  getPublicServiceCategories,
  listManagedServiceCategories,
  updateServiceCategory,
} from '../services/serviceCatalogService.js';
import { badRequest } from '../utils/http.js';

export async function listPublic(req, res) {
  const countryCode = String(req.params.countryCode || '').toUpperCase();
  const services = await getPublicServiceCategories(countryCode, req.query.q);
  res.json({ success: true, countryCode, services });
}

export async function listAdmin(req, res) {
  const countryCode = String(req.query.countryCode || 'KE').toUpperCase();
  const services = await listManagedServiceCategories({
    countryCode,
    search: req.query.q,
    includeInactive: req.query.includeInactive !== 'false',
  });
  res.json({ success: true, countryCode, services });
}

export async function create(req, res) {
  const service = await createServiceCategory(req.body, req.user.id);
  res.status(201).json({ success: true, service });
}

export async function update(req, res) {
  const service = await updateServiceCategory(req.params.slug, req.body, req.user.id);
  res.json({ success: true, service });
}

export async function deactivate(req, res) {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw badRequest('Service slug is required');
  const service = await deactivateServiceCategory(slug, req.user.id);
  res.json({ success: true, service });
}
