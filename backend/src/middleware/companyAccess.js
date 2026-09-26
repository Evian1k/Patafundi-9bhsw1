// companyAccess.js — organization-scoping middleware for the company portal.
// Every company endpoint resolves the caller's membership in a SPECIFIC
// company and rejects cross-company access. Never rely on frontend hiding.
import { query } from '../db.js';
import { forbidden, notFound } from '../utils/http.js';

export const COMPANY_MEMBER_ROLES = ['owner', 'manager', 'admin', 'dispatcher', 'finance', 'technician'];
// roles allowed to administer the company (profile, team, services, finance)
export const COMPANY_ADMIN_ROLES = ['owner', 'manager', 'admin'];
// roles allowed to dispatch (assign technicians)
export const COMPANY_DISPATCH_ROLES = ['owner', 'manager', 'admin', 'dispatcher'];
// roles allowed to see finance (earnings/settlements)
export const COMPANY_FINANCE_ROLES = ['owner', 'finance'];

function isPlatformStaff(user) {
  return user && ['super_admin', 'admin'].includes(user.role);
}

/** Load membership of `userId` in company `companyId` (or null). */
export async function getMembership(companyId, userId) {
  const result = await query(
    `select cm.*, u.full_name, u.email, u.phone as user_phone
     from company_members cm join users u on u.id = cm.user_id
     where cm.company_id = $1 and cm.user_id = $2 limit 1`,
    [companyId, userId],
  );
  return result.rows[0] || null;
}

/** Get the company profile row by id. */
export async function getCompany(companyId) {
  const result = await query('select * from company_profiles where id = $1', [companyId]);
  return result.rows[0] || null;
}

/**
 * Express middleware: req.company = company row, req.companyMembership = member row.
 * Expects :companyId param OR resolves the caller's primary company when `primary: true`.
 */
export function requireCompanyMember(options = {}) {
  const { roles = null, primary = false } = options;
  return async (req, _res, next) => {
    try {
      const companyId = primary ? null : (req.params.companyId || req.body?.companyId || req.query?.companyId);
      if (!primary && !companyId) throw notFound('Company not found');
      if (isPlatformStaff(req.user)) {
        const company = companyId ? await getCompany(companyId) : null;
        if (companyId && !company) throw notFound('Company not found');
        req.company = company;
        req.companyMembership = { role: 'platform_staff', status: 'active' };
        return next();
      }
      let membership = null;
      let company = null;
      if (primary) {
        const rows = await query(
          `select cm.*, cp.id as company_id from company_members cm
           join company_profiles cp on cp.id = cm.company_id
           where cm.user_id = $1 and cm.status = 'active'
           order by cm.joined_at asc limit 1`,
          [req.user.id],
        );
        membership = rows.rows[0] || null;
        if (membership) company = await getCompany(membership.company_id);
      } else {
        company = await getCompany(companyId);
        if (!company) throw notFound('Company not found');
        membership = await getMembership(companyId, req.user.id);
      }
      if (!membership || !company) throw forbidden('You are not a member of this company');
      if (membership.status !== 'active') throw forbidden('Your company membership is suspended');
      if (roles && !roles.includes(membership.role)) {
        throw forbidden('Your company role is not authorized for this action');
      }
      req.company = company;
      req.companyMembership = membership;
      return next();
    } catch (error) {
      next(error);
    }
  };
}

/** Does `userId` have access to job row (company member / assigned technician)? */
export async function canAccessCompanyJob(user, job) {
  if (!user || !job) return false;
  if (isPlatformStaff(user)) return true;
  if (job.technician_user_id && job.technician_user_id === user.id) return true;
  if (job.company_id) {
    const membership = await getMembership(job.company_id, user.id);
    return Boolean(membership && membership.status === 'active');
  }
  return false;
}

/** Customer-safe company projection — NEVER expose internals (settlements, commission, notes). */
export function publicCompanyProfile(company, { withStats = false } = {}) {
  if (!company) return null;
  const base = {
    id: company.id,
    companyName: company.company_name,
    legalName: company.legal_name,
    description: company.description,
    logoUrl: company.logo_url || null,
    verificationStatus: company.status,
    businessCategories: company.business_categories || [],
    serviceAreas: company.service_areas || [],
    branches: Array.isArray(company.branches) ? company.branches : [],
    availability: company.availability || 'available',
    guarantees: Array.isArray(company.guarantees) ? company.guarantees : [],
    website: company.website || null,
    rating: company.rating != null ? Number(company.rating) : null,
  };
  if (withStats) {
    base.completedJobs = company.completed_jobs ?? 0;
    base.teamSize = company.team_size ?? 0;
  }
  return base;
}
