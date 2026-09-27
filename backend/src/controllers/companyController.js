// companyController.js — PataFundi company partner ecosystem.
// Takeover rebuild: full portal API (overview, profile, services, team,
// jobs, dispatch, schedule, quality, finance) with organization isolation
// enforced server-side on EVERY endpoint via requireCompanyMember.
import { query, transaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { emitEvent } from '../realtime.js';
import {
  requireCompanyMember,
  getMembership,
  getCompany,
  publicCompanyProfile,
  hasCapability,
  effectiveCapabilities,
  COMPANY_ADMIN_ROLES,
  COMPANY_CAPABILITIES,
  COMPANY_MEMBER_ROLES,
  COMPANY_DISPATCH_ROLES,
  COMPANY_FINANCE_ROLES,
} from '../middleware/companyAccess.js';

const APPLICATION_STATUSES = ['draft', 'submitted', 'reviewing', 'more_info_required', 'approved', 'rejected', 'suspended', 'archived'];

function toCompanySummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    legalName: row.legal_name,
    description: row.description,
    logoUrl: row.logo_url || null,
    status: row.status,
    businessCategories: row.business_categories || [],
    serviceAreas: row.service_areas || [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    technicianCount: row.technician_count ?? row.team_size ?? 0,
    rating: row.rating != null ? Number(row.rating) : 0,
    completedJobs: row.completed_jobs ?? 0,
    availability: row.availability || 'available',
    website: row.website || null,
    guarantees: Array.isArray(row.guarantees) ? row.guarantees : [],
    createdAt: row.created_at,
  };
}

function toMemberSummary(row) {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || row.user_phone || null,
    role: row.role,
    status: row.status,
    isAvailable: row.is_available,
    skills: row.skills || [],
    // explicit capability overrides (null = role defaults apply)
    permissions: row.permissions || null,
    joinedAt: row.joined_at,
  };
}

function validPermissions(value) {
  if (value === null || value === undefined) return null; // clear overrides → role defaults
  if (!Array.isArray(value)) throw badRequest('permissions must be an array of capability keys');
  const unique = [...new Set(value)];
  for (const key of unique) {
    if (!COMPANY_CAPABILITIES.includes(key)) throw badRequest(`Unknown capability: ${key}`);
  }
  return JSON.stringify(unique);
}

function maskAccount(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 4) return '••••';
  return `•••• ${str.slice(-4)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC: Partner applications (spec §7)
// ────────────────────────────────────────────────────────────────────────────
export async function createPartnerApplication(req, res) {
  const body = req.body || {};
  const required = ['companyName', 'contactName', 'contactEmail', 'contactPhone'];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '') {
      throw badRequest(`${field} is required`);
    }
  }
  const status = APPLICATION_STATUSES.includes(body.status) ? body.status : 'submitted';
  const result = await query(
    `insert into company_partner_applications
       (user_id, company_name, legal_name, contact_name, contact_email, contact_phone,
        company_registration_number, business_categories, service_areas, branches,
        technician_count, license_details, description, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      req.user.id,
      body.companyName, body.legalName || null, body.contactName,
      String(body.contactEmail).toLowerCase(), body.contactPhone,
      body.registrationNumber || body.companyRegistrationNumber || null,
      Array.isArray(body.businessCategories) ? body.businessCategories : [],
      Array.isArray(body.serviceAreas) ? body.serviceAreas : [],
      JSON.stringify(Array.isArray(body.branches) ? body.branches : []),
      Number(body.technicianCount || body.teamSize || 0),
      body.licenseDetails || body.license_details || null,
      body.description || null,
      status,
    ],
  );
  await auditLog({
    userId: req.user.id, action: 'company.application.create',
    entityType: 'company_partner_application', entityId: result.rows[0].id,
    metadata: { companyName: body.companyName },
  });
  // notify staff (ops) for review
  await query(
    `insert into notifications (user_id, type, title, body, data)
     select id, 'company_application', 'New Company Application', $1, $2::jsonb
     from users where role in ('admin','super_admin') and status = 'active'`,
    [`${body.companyName} submitted a partner application.`,
     JSON.stringify({ applicationId: result.rows[0].id })],
  );
  res.status(201).json({ success: true, application: toPartnerApplicationSummary(result.rows[0]) });
}

function toPartnerApplicationSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    legalName: row.legal_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    registrationNumber: row.company_registration_number,
    businessCategories: row.business_categories || [],
    serviceAreas: row.service_areas || [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    technicianCount: row.technician_count,
    licenseDetails: row.license_details,
    description: row.description,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by_user_id,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

export async function listMyApplications(req, res) {
  const result = await query(
    `select * from company_partner_applications where user_id = $1 order by created_at desc`,
    [req.user.id],
  );
  res.json({ success: true, applications: result.rows.map(toPartnerApplicationSummary) });
}

// Admin: list all applications (staff review queue)
export async function adminListApplications(req, res) {
  const { status } = req.query || {};
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `where status = $1`; }
  const result = await query(
    `select a.*, u.full_name as applicant_name, u.email as applicant_email
     from company_partner_applications a left join users u on u.id = a.user_id
     ${where} order by a.created_at desc limit 200`,
    params,
  );
  res.json({ success: true, applications: result.rows.map(toPartnerApplicationSummary) });
}

// Admin/applicant: review lifecycle transition — reviewing / more_info_required /
// approved / rejected / suspended. Approval provisions the company + owner.
export async function reviewPartnerApplication(req, res) {
  const { status, verificationNotes, reviewNotes } = req.body || {};
  if (!APPLICATION_STATUSES.includes(status)) throw badRequest('Invalid status');
  const appRes = await query('select * from company_partner_applications where id = $1', [req.params.id]);
  const application = appRes.rows[0];
  if (!application) throw notFound('Application not found');

  // Applicants may only move their own draft → submitted
  if (status === 'submitted' && application.user_id === req.user.id) {
    if (application.status !== 'draft') throw badRequest('Only draft applications can be submitted');
  } else if (!['super_admin', 'admin'].includes(req.user.role)) {
    throw forbidden('Only platform staff can review company applications');
  }

  const updated = await query(
    `update company_partner_applications
     set status = $1, review_notes = $2, reviewed_by_user_id = $3,
       approved_at = case when $1 = 'approved' then now() else approved_at end,
       updated_at = now()
     where id = $4 returning *`,
    [status, verificationNotes || reviewNotes || application.review_notes, req.user.id, req.params.id],
  );

  if (status === 'approved') {
    // idempotent company provisioning
    const existing = await query('select * from company_profiles where application_id = $1', [application.id]);
    if (!existing.rows[0]) {
      await transaction(async (client) => {
        const company = await client.query(
          `insert into company_profiles
             (application_id, owner_user_id, company_name, legal_name, contact_name,
              contact_email, contact_phone, registration_number, business_categories,
              service_areas, branches, technician_count, license_details, description, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'approved')
           returning id`,
          [application.id, application.user_id, application.company_name, application.legal_name,
           application.contact_name, application.contact_email, application.contact_phone,
           application.company_registration_number, application.business_categories,
           application.service_areas, application.branches, application.technician_count,
           application.license_details, application.description],
        );
        await client.query(
          `insert into company_members (company_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')
           on conflict (company_id, user_id) do nothing`,
          [company.rows[0].id, application.user_id],
        );
        await client.query(
          `update users set role = 'company_admin', updated_at = now()
           where id = $1 and role in ('customer','fundi_pending')`,
          [application.user_id],
        );
      });
    }
  }

  if (status === 'suspended') {
    await query(`update company_profiles set status = 'suspended', updated_at = now() where application_id = $1`, [application.id]);
  }

  await auditLog({
    userId: req.user.id, action: `company.application.${status}`,
    entityType: 'company_partner_application', entityId: application.id,
    metadata: { companyName: application.company_name, notes: verificationNotes || reviewNotes || null },
  });
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'company_application', 'Application Update', $2, $3::jsonb)`,
    [application.user_id, `Your partner application for ${application.company_name} is now "${status}".`,
     JSON.stringify({ applicationId: application.id, status })],
  );
  res.json({ success: true, application: toPartnerApplicationSummary(updated.rows[0]) });
}

// Back-compat export (old admin approve endpoint)
export async function approvePartnerApplication(req, res) {
  req.body = { ...req.body, status: req.body?.status || 'approved' };
  return reviewPartnerApplication(req, res);
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC DIRECTORY (customer-safe, spec §5) — no internal data ever
// ────────────────────────────────────────────────────────────────────────────
export async function publicCompanyDirectory(req, res) {
  const { category, search, area } = req.query || {};
  const params = [];
  let where = `where cp.status = 'approved'`;
  if (category) {
    params.push(category);
    where += ` and $${params.length} = any(cp.business_categories)`;
  }
  if (area) {
    params.push(area);
    where += ` and $${params.length} = any(cp.service_areas)`;
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` and (cp.company_name ilike $${params.length} or cp.description ilike $${params.length})`;
  }
  const result = await query(
    `select cp.*,
       (select count(*) from company_members cm where cm.company_id = cp.id and cm.role = 'technician' and cm.status = 'active') as active_technicians,
       (select count(*) from jobs j where j.company_id = cp.id and j.status = 'completed') as completed_count,
       (select coalesce(avg(r.rating), 0) from reviews r join jobs j2 on j2.id = r.job_id where j2.company_id = cp.id) as avg_rating
     from company_profiles cp ${where}
     order by avg_rating desc nulls last, completed_count desc limit 60`,
    params,
  );
  const companies = result.rows.map((row) => ({
    ...publicCompanyProfile(row, { withStats: true }),
    completedJobs: Number(row.completed_count || row.completed_jobs || 0),
    rating: Math.round(Number(row.avg_rating || row.rating || 0) * 10) / 10,
    teamSize: Number(row.active_technicians || 0),
  }));
  res.json({ success: true, companies });
}

export async function publicCompanyProfileById(req, res) {
  const companyRes = await query('select * from company_profiles where id = $1', [req.params.id]);
  const company = companyRes.rows[0];
  if (!company || company.status !== 'approved') throw notFound('Company not found');
  const services = await query(
    `select id, name, category, description, base_price, duration_minutes
     from company_services where company_id = $1 and is_active = true order by category, name`,
    [company.id],
  );
  const reviewsRes = await query(
    `select r.id, r.rating, r.comment, r.created_at, j.service_category,
       left(u.full_name, 1) || '****' as reviewer_name
     from reviews r join jobs j on j.id = r.job_id join users u on u.id = r.reviewer_id
     where j.company_id = $1 order by r.created_at desc limit 10`,
    [company.id],
  );
  const stats = await query(
    `select count(*) filter (where status = 'completed') as completed,
       count(*) filter (where status in ('in_progress','on_the_way','arrived','accepted','assigned')) as active
     from jobs where company_id = $1`,
    [company.id],
  );
  res.json({
    success: true,
    company: {
      ...publicCompanyProfile(company, { withStats: true }),
      completedJobs: Number(stats.rows[0]?.completed || 0),
      activeJobs: Number(stats.rows[0]?.active || 0),
    },
    services: services.rows,
    reviews: reviewsRes.rows,
    // NOTE: settlements, commission, payroll, internal notes are NEVER included
  });
}

// ────────────────────────────────────────────────────────────────────────────
// COMPANY PORTAL — all endpoints below are company-scoped (requireCompanyMember)
// ────────────────────────────────────────────────────────────────────────────

export const portalAccess = requireCompanyMember({ primary: true });

export async function portalOverview(req, res) {
  const companyId = req.company.id;
  const stats = await query(
    `select
       count(*) filter (where status in ('pending','matching','scheduled')) as incoming,
       count(*) filter (where status in ('accepted','assigned','offered')) as awaiting_dispatch,
       count(*) filter (where status in ('on_the_way','arrived','in_progress')) as active,
       count(*) filter (where status = 'completion_requested') as awaiting_confirmation,
       count(*) filter (where status = 'completed') as completed,
       count(*) filter (where status = 'cancelled') as cancelled
     from jobs where company_id = $1`,
    [companyId],
  );
  const team = await query(
    `select count(*) as total, count(*) filter (where is_available and status = 'active' and role = 'technician') as available_technicians
     from company_members where company_id = $1`,
    [companyId],
  );
  const finance = await query(
    `select coalesce(sum(net_amount), 0) as pending_settlements
     from company_settlements where company_id = $1 and status = 'pending'`,
    [companyId],
  );
  const rating = await query(
    `select coalesce(avg(r.rating), 0) as avg_rating, count(r.id) as review_count
     from reviews r join jobs j on j.id = r.job_id where j.company_id = $1`,
    [companyId],
  );
  const recent = await query(
    `select j.id, j.status, j.service_category, j.urgency, j.estimated_price, j.final_price,
       j.scheduled_at, j.created_at, j.provider_type,
       u.full_name as customer_name, t.full_name as technician_name
     from jobs j
     left join users u on u.id = j.customer_id
     left join users t on t.id = j.technician_user_id
     where j.company_id = $1 order by j.created_at desc limit 8`,
    [companyId],
  );
  const company = toCompanySummary({ ...req.company, team_size: team.rows[0]?.total });
  res.json({
    success: true,
    company,
    stats: {
      ...stats.rows[0],
      availableTechnicians: Number(team.rows[0]?.available_technicians || 0),
      teamSize: Number(team.rows[0]?.total || 0),
      pendingSettlements: Number(finance.rows[0]?.pending_settlements || 0),
      rating: Math.round(Number(rating.rows[0]?.avg_rating || 0) * 10) / 10,
      reviewCount: Number(rating.rows[0]?.review_count || 0),
      totalJobs: Number(stats.rows[0]?.incoming || 0) + Number(stats.rows[0]?.awaiting_dispatch || 0)
        + Number(stats.rows[0]?.active || 0) + Number(stats.rows[0]?.awaiting_confirmation || 0)
        + Number(stats.rows[0]?.completed || 0) + Number(stats.rows[0]?.cancelled || 0),
    },
    recentJobs: recent.rows,
    myRole: req.companyMembership.role,
  });
}

export async function portalProfile(req, res) {
  if (req.method === 'PUT') {
    // only members with manage_settings can edit the business profile
    if (!hasCapability(req.companyMembership, 'manage_settings')) {
      throw forbidden('Only company owners/managers can edit the business profile');
    }
    const b = req.body || {};
    await query(
      `update company_profiles set
         company_name = $2, legal_name = coalesce($3, legal_name),
         description = coalesce($4, description),
         logo_url = coalesce($5, logo_url),
         business_categories = coalesce($6, business_categories),
         service_areas = coalesce($7, service_areas),
         branches = coalesce($8, branches),
         availability = coalesce($9, availability),
         guarantees = coalesce($10, guarantees),
         website = coalesce($11, website),
         team_size = coalesce($12, team_size),
         updated_at = now()
       where id = $1`,
      [req.company.id, b.companyName || req.company.company_name, b.legalName ?? null,
       b.description ?? null, b.logoUrl ?? null,
       Array.isArray(b.businessCategories) ? b.businessCategories : null,
       Array.isArray(b.serviceAreas) ? b.serviceAreas : null,
       Array.isArray(b.branches) ? JSON.stringify(b.branches) : null,
       b.availability ?? null,
       Array.isArray(b.guarantees) ? JSON.stringify(b.guarantees) : null,
       b.website ?? null, b.teamSize ?? null],
    );
    await auditLog({ userId: req.user.id, action: 'company.profile.update', entityType: 'company', entityId: req.company.id });
  }
  const company = await getCompany(req.company.id);
  res.json({ success: true, company: toCompanySummary(company), myRole: req.companyMembership.role });
}

// ── Services catalog ──
export async function portalServices(req, res) {
  const result = await query(
    `select * from company_services where company_id = $1 order by category, name`,
    [req.company.id],
  );
  res.json({ success: true, services: result.rows });
}

export async function portalCreateService(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_services')) throw forbidden('Not authorized');
  const b = req.body || {};
  if (!b.name || !b.category) throw badRequest('name and category are required');
  const result = await query(
    `insert into company_services (company_id, name, category, description, base_price, duration_minutes)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.company.id, b.name, b.category, b.description || null, b.basePrice || null, b.durationMinutes || null],
  );
  await auditLog({ userId: req.user.id, action: 'company.service.create', entityType: 'company_service', entityId: result.rows[0].id });
  res.status(201).json({ success: true, service: result.rows[0] });
}

export async function portalUpdateService(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_services')) throw forbidden('Not authorized');
  const own = await query(
    `select * from company_services where id = $1 and company_id = $2`,
    [req.params.serviceId, req.company.id],
  );
  if (!own.rows[0]) throw notFound('Service not found');
  const b = req.body || {};
  const result = await query(
    `update company_services set
       name = coalesce($2, name), category = coalesce($3, category),
       description = coalesce($4, description), base_price = coalesce($5, base_price),
       duration_minutes = coalesce($6, duration_minutes), is_active = coalesce($7, is_active),
       updated_at = now()
     where id = $1 returning *`,
    [req.params.serviceId, b.name ?? null, b.category ?? null, b.description ?? null,
     b.basePrice ?? null, b.durationMinutes ?? null,
     typeof b.isActive === 'boolean' ? b.isActive : null],
  );
  res.json({ success: true, service: result.rows[0] });
}

export async function portalDeleteService(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_services')) throw forbidden('Not authorized');
  const result = await query(
    `delete from company_services where id = $1 and company_id = $2 returning id`,
    [req.params.serviceId, req.company.id],
  );
  if (!result.rows[0]) throw notFound('Service not found');
  res.json({ success: true });
}

// ── Team / technicians ──
export async function portalTeam(req, res) {
  const result = await query(
    `select cm.*, u.full_name, u.email, u.phone as user_phone,
       (select count(*) from jobs j where j.technician_user_id = cm.user_id
         and j.company_id = cm.company_id and j.status in ('on_the_way','arrived','in_progress')) as active_jobs
     from company_members cm join users u on u.id = cm.user_id
     where cm.company_id = $1 order by cm.role, cm.joined_at`,
    [req.company.id],
  );
  res.json({ success: true, team: result.rows.map((r) => ({ ...toMemberSummary(r), activeJobs: Number(r.active_jobs || 0) })) });
}

export async function portalAddMember(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_team')) throw forbidden('Not authorized');
  const b = req.body || {};
  if (!b.fullName || !b.email || !b.role) throw badRequest('fullName, email and role are required');
  if (!COMPANY_MEMBER_ROLES.filter((r) => r !== 'owner').includes(b.role)) {
    throw badRequest('Invalid role');
  }
  const permissions = validPermissions(b.permissions);
  const bcrypt = (await import('bcryptjs')).default;
  const tempPassword = b.password || `Pf-${Math.random().toString(36).slice(2, 10)}!`;
  const hash = await bcrypt.hash(tempPassword, 12);
  const member = await transaction(async (client) => {
    const userRes = await client.query(
      `insert into users (email, password_hash, full_name, phone, role, status, email_verified_at)
       values (lower($1), $2, $3, $4, 'customer', 'active', now())
       on conflict (email) do update set full_name = excluded.full_name
       returning id, email, full_name`,
      [b.email, hash, b.fullName, b.phone || null],
    );
    const userId = userRes.rows[0].id;
    const memberRes = await client.query(
      `insert into company_members (company_id, user_id, role, status, skills, phone, permissions)
       values ($1, $2, $3, 'active', $4, $5, $6::jsonb)
       on conflict (company_id, user_id) do update set
         role = excluded.role, status = 'active', skills = excluded.skills, permissions = excluded.permissions
       returning *`,
      [req.company.id, userId, b.role, Array.isArray(b.skills) ? b.skills : [], b.phone || null, permissions],
    );
    return { member: memberRes.rows[0], user: userRes.rows[0], tempPassword: b.password ? undefined : tempPassword };
  });
  await auditLog({
    userId: req.user.id, action: 'company.member.add', entityType: 'company_member',
    entityId: member.member.id, metadata: { role: b.role, email: b.email },
  });
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'company_team', 'Added to Company Team', $2, $3::jsonb)`,
    [member.user.id, `You have been added to ${req.company.company_name} as ${b.role}.`,
     JSON.stringify({ companyId: req.company.id })],
  );
  res.status(201).json({
    success: true,
    member: toMemberSummary(member.member),
    temporaryPassword: member.tempPassword,
  });
}

export async function portalUpdateMember(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_team')) throw forbidden('Not authorized');
  const own = await query(
    `select * from company_members where id = $1 and company_id = $2`,
    [req.params.memberId, req.company.id],
  );
  if (!own.rows[0]) throw notFound('Member not found');
  if (own.rows[0].role === 'owner') throw forbidden('The owner account cannot be modified here');
  const b = req.body || {};
  if (b.role && !COMPANY_MEMBER_ROLES.includes(b.role)) throw badRequest('Invalid role');
  // permissions semantics: key absent = no change; null or [] = clear overrides
  // (fall back to role defaults); non-empty array = explicit capability set.
  const hasPerms = Object.prototype.hasOwnProperty.call(b, 'permissions');
  let permsValue = null;
  if (hasPerms) {
    if (b.permissions === null || (Array.isArray(b.permissions) && b.permissions.length === 0)) {
      permsValue = null;
    } else if (Array.isArray(b.permissions)) {
      for (const key of b.permissions) {
        if (!COMPANY_CAPABILITIES.includes(key)) throw badRequest(`Unknown capability: ${key}`);
      }
      permsValue = JSON.stringify([...new Set(b.permissions)]);
    } else {
      throw badRequest('permissions must be an array of capability keys (or null to reset)');
    }
  }
  const result = await query(
    `update company_members set
       role = coalesce($2, role), status = coalesce($3, status),
       is_available = coalesce($4, is_available), skills = coalesce($5, skills),
       permissions = case when $6::boolean then $7::jsonb else permissions end
     where id = $1 returning *`,
    [req.params.memberId, b.role ?? null, b.status ?? null,
     typeof b.isAvailable === 'boolean' ? b.isAvailable : null,
     Array.isArray(b.skills) ? b.skills : null,
     hasPerms, permsValue],
  );
  await auditLog({
    userId: req.user.id, action: 'company.member.update', entityType: 'company_member',
    entityId: req.params.memberId,
    metadata: { changes: { role: b.role, status: b.status, permissions: hasPerms ? (permsValue ? JSON.parse(permsValue) : 'role_defaults') : undefined } },
  });
  res.json({ success: true, member: toMemberSummary(result.rows[0]) });
}

export async function portalRemoveMember(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_team')) throw forbidden('Not authorized');
  const own = await query(
    `select * from company_members where id = $1 and company_id = $2`,
    [req.params.memberId, req.company.id],
  );
  if (!own.rows[0]) throw notFound('Member not found');
  if (own.rows[0].role === 'owner') throw forbidden('The owner cannot be removed');
  await query(`delete from company_members where id = $1`, [req.params.memberId]);
  await auditLog({
    userId: req.user.id, action: 'company.member.remove', entityType: 'company_member', entityId: req.params.memberId,
  });
  res.json({ success: true });
}

// ── Jobs: scoped lists + dispatch ──
const JOB_LIST_FIELDS = `j.id, j.status, j.provider_type, j.service_category, j.description, j.urgency,
  j.location_name, j.customer_latitude, j.customer_longitude, j.estimated_price, j.final_price,
  j.scheduled_at, j.payment_status, j.escrow_status, j.company_job_ref, j.created_at, j.updated_at,
  u.full_name as customer_name, u.phone as customer_phone,
  t.full_name as technician_name,
  p.label as property_label, p.address_line as property_address`;

export async function portalJobs(req, res) {
  const { scope = 'all' } = req.query || {};
  const params = [req.company.id];
  let where = `where j.company_id = $1`;
  if (scope === 'incoming') where += ` and j.status in ('pending','matching','scheduled')`;
  else if (scope === 'dispatch') where += ` and j.status in ('accepted','offered')`;
  else if (scope === 'active') where += ` and j.status in ('assigned','on_the_way','arrived','in_progress')`;
  else if (scope === 'awaiting_confirmation') where += ` and j.status = 'completion_requested'`;
  else if (scope === 'completed') where += ` and j.status = 'completed'`;
  else if (scope === 'cancelled') where += ` and j.status in ('cancelled','failed')`;
  const result = await query(
    `select ${JOB_LIST_FIELDS}
     from jobs j
     left join users u on u.id = j.customer_id
     left join users t on t.id = j.technician_user_id
     left join customer_properties p on p.id = j.property_id
     ${where} order by j.created_at desc limit 100`,
    params,
  );
  res.json({ success: true, jobs: result.rows });
}

// Open pool: company jobs not yet claimed by any company (marketplace-wide)
export async function portalOpenPool(req, res) {
  const company = req.company;
  const result = await query(
    `select j.id, j.status, j.provider_type, j.service_category, j.description, j.urgency,
       j.location_name, j.estimated_price, j.scheduled_at, j.created_at,
       u.full_name as customer_name
     from jobs j left join users u on u.id = j.customer_id
     where j.provider_type = 'company' and j.company_id is null
       and j.status in ('pending','matching')
       and (j.service_category = any($2) or cardinality($2) = 0)
     order by j.urgency = 'emergency' desc, j.created_at asc limit 50`,
    [company.id, company.business_categories?.length ? company.business_categories : []],
  );
  res.json({ success: true, jobs: result.rows });
}

export async function claimPoolJob(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) throw forbidden('Not authorized');
  const result = await query(
    `update jobs set company_id = $2, updated_at = now()
     where id = $1 and provider_type = 'company' and company_id is null
       and status in ('pending','matching')
     returning *`,
    [req.params.jobId, req.company.id],
  );
  if (!result.rows[0]) throw badRequest('Job is no longer available');
  await auditLog({
    userId: req.user.id, action: 'company.job.claim', entityType: 'job', entityId: req.params.jobId,
    metadata: { companyId: req.company.id },
  });
  res.json({ success: true, job: result.rows[0] });
}

export async function acceptCompanyJob(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) throw forbidden('Not authorized');
  const result = await query(
    `update jobs set status = 'accepted', updated_at = now()
     where id = $1 and company_id = $2 and status in ('pending','matching','scheduled')
     returning *`,
    [req.params.jobId, req.company.id],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be accepted in its current state');
  const job = result.rows[0];
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_accepted', 'Job Accepted', $2, $3::jsonb)`,
    [job.customer_id, `${req.company.company_name} has accepted your ${job.service_category} request.`,
     JSON.stringify({ jobId: job.id })],
  );
  emitEvent('job:accepted', { jobId: job.id, companyName: req.company.company_name }, `job:${job.id}`);
  await recordJobTimeline(job.id, 'company_accepted', req.user.id, req.user.role);
  await auditLog({ userId: req.user.id, action: 'company.job.accept', entityType: 'job', entityId: job.id });
  res.json({ success: true, job });
}

export async function rejectCompanyJob(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) throw forbidden('Not authorized');
  const result = await query(
    `update jobs set company_id = null, status = 'matching', updated_at = now()
     where id = $1 and company_id = $2 and status in ('pending','accepted','scheduled')
     returning id`,
    [req.params.jobId, req.company.id],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be rejected in its current state');
  await auditLog({
    userId: req.user.id, action: 'company.job.reject', entityType: 'job', entityId: req.params.jobId,
    metadata: { reason: req.body?.reason || null },
  });
  res.json({ success: true });
}

// Company quote for inspection/complex jobs (spec §22): sets price + status offered
export async function quoteCompanyJob(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) throw forbidden('Not authorized');
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('A valid quote amount is required');
  const result = await query(
    `update jobs set estimated_price = $2, status = 'offered', updated_at = now()
     where id = $1 and company_id = $3 and status in ('pending','accepted','matching','scheduled')
     returning *`,
    [req.params.jobId, amount, req.company.id],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be quoted in its current state');
  const job = result.rows[0];
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_quote', 'New Quote Received', $2, $3::jsonb)`,
    [job.customer_id, `${req.company.company_name} quoted KES ${amount.toLocaleString()} for your ${job.service_category} job. Review it to approve work.`,
     JSON.stringify({ jobId: job.id, amount })],
  );
  emitEvent('job:quote', { jobId: job.id, amount }, `job:${job.id}`);
  await recordJobTimeline(job.id, 'quote_sent', req.user.id, req.user.role, { amount });
  res.json({ success: true, job });
}

// DISPATCH (spec §10): assign a technician belonging to THIS company only
export async function assignTechnician(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) {
    throw forbidden('Only dispatchers/managers can assign technicians');
  }
  const { technicianMemberId } = req.body || {};
  if (!technicianMemberId) throw badRequest('technicianMemberId is required');
  const techRes = await query(
    `select cm.*, u.id as user_id, u.full_name from company_members cm
     join users u on u.id = cm.user_id
     where cm.id = $1 and cm.company_id = $2 and cm.status = 'active'`,
    [technicianMemberId, req.company.id],
  );
  const tech = techRes.rows[0];
  if (!tech) throw forbidden('Technician must be an active member of your company');
  const jobRes = await query(
    `update jobs set
       fundi_id = $2, technician_user_id = $2, assigned_by = $3,
       status = 'assigned', updated_at = now()
     where id = $1 and company_id = $4 and status in ('accepted','offered','scheduled','matching','pending')
     returning *`,
    [req.params.jobId, tech.user_id, req.user.id, req.company.id],
  );
  const job = jobRes.rows[0];
  if (!job) throw badRequest('Job cannot be assigned in its current state');
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_assignment', 'New Job Assignment', $2, $3::jsonb)`,
    [tech.user_id, `You have been assigned a ${job.service_category} job at ${job.location_name}.`,
     JSON.stringify({ jobId: job.id })],
  );
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'job_assigned', 'Technician Assigned', $2, $3::jsonb)`,
    [job.customer_id, `${tech.full_name} from ${req.company.company_name} will handle your ${job.service_category} job.`,
     JSON.stringify({ jobId: job.id, technicianName: tech.full_name })],
  );
  emitEvent('job:assigned', { jobId: job.id, technicianName: tech.full_name }, `job:${job.id}`);
  emitEvent('job:assigned', { jobId: job.id }, `user:${tech.user_id}`);
  await recordJobTimeline(job.id, 'technician_assigned', req.user.id, req.user.role, { technician: tech.full_name });
  await auditLog({
    userId: req.user.id, action: 'company.job.assign_technician', entityType: 'job', entityId: job.id,
    metadata: { technicianUserId: tech.user_id, technicianMemberId },
  });
  res.json({ success: true, job });
}

export async function unassignTechnician(req, res) {
  if (!COMPANY_DISPATCH_ROLES.includes(req.companyMembership.role)) throw forbidden('Not authorized');
  const result = await query(
    `update jobs set fundi_id = null, technician_user_id = null, assigned_by = null,
       status = 'accepted', updated_at = now()
     where id = $1 and company_id = $2 and status in ('assigned','on_the_way')
     returning *`,
    [req.params.jobId, req.company.id],
  );
  if (!result.rows[0]) throw badRequest('Job cannot be unassigned in its current state');
  await auditLog({ userId: req.user.id, action: 'company.job.unassign_technician', entityType: 'job', entityId: req.params.jobId });
  res.json({ success: true, job: result.rows[0] });
}

// ── Schedule (spec §9 SCHEDULE) ──
export async function portalSchedule(req, res) {
  const result = await query(
    `select j.id, j.status, j.service_category, j.scheduled_at, j.urgency,
       t.full_name as technician_name, t.id as technician_user_id,
       u.full_name as customer_name, j.location_name
     from jobs j
     left join users t on t.id = j.technician_user_id
     left join users u on u.id = j.customer_id
     where j.company_id = $1 and j.scheduled_at is not null
       and j.status not in ('completed','cancelled','failed')
     order by j.scheduled_at asc limit 100`,
    [req.company.id],
  );
  const availability = await query(
    `select cm.id, cm.user_id, u.full_name, cm.role, cm.is_available, cm.skills,
       (select count(*) from jobs j where j.technician_user_id = cm.user_id
         and j.company_id = cm.company_id and j.status in ('assigned','on_the_way','arrived','in_progress')) as workload
     from company_members cm join users u on u.id = cm.user_id
     where cm.company_id = $1 and cm.status = 'active' order by cm.role`,
    [req.company.id],
  );
  res.json({ success: true, scheduledJobs: result.rows, availability: availability.rows });
}

// ── Quality: reviews for this company ──
export async function portalReviews(req, res) {
  const reviews = await query(
    `select r.id, r.rating, r.comment, r.created_at, j.id as job_id,
       j.service_category, u.full_name as customer_name
     from reviews r join jobs j on j.id = r.job_id join users u on u.id = r.reviewer_id
     where j.company_id = $1 order by r.created_at desc limit 50`,
    [req.company.id],
  );
  const stats = await query(
    `select coalesce(avg(r.rating),0) as avg_rating, count(*) as total,
       count(*) filter (where r.rating >= 4) as positive
     from reviews r join jobs j on j.id = r.job_id where j.company_id = $1`,
    [req.company.id],
  );
  res.json({
    success: true,
    reviews: reviews.rows,
    stats: {
      averageRating: Math.round(Number(stats.rows[0]?.avg_rating || 0) * 10) / 10,
      total: Number(stats.rows[0]?.total || 0),
      positive: Number(stats.rows[0]?.positive || 0),
    },
  });
}

// ── Finance: earnings + settlements (spec §9 FINANCE, §16 money flow) ──
export async function portalFinance(req, res) {
  if (!hasCapability(req.companyMembership, 'view_finance')) {
    throw forbidden('Only owners/finance users can view company finances');
  }
  const summary = await query(
    `select
       coalesce(sum(gross_amount), 0) as gross,
       coalesce(sum(commission_amount), 0) as commission,
       coalesce(sum(net_amount), 0) as net,
       coalesce(sum(net_amount) filter (where status = 'pending'), 0) as pending,
       coalesce(sum(net_amount) filter (where status = 'paid'), 0) as paid
     from company_settlements where company_id = $1`,
    [req.company.id],
  );
  const settlements = await query(
    `select s.*, j.service_category, j.location_name
     from company_settlements s left join jobs j on j.id = s.job_id
     where s.company_id = $1 order by s.created_at desc limit 100`,
    [req.company.id],
  );
  const monthly = await query(
    `select date_trunc('month', created_at) as month,
       sum(gross_amount) as gross, sum(commission_amount) as commission, sum(net_amount) as net
     from company_settlements where company_id = $1
     group by 1 order by 1 desc limit 12`,
    [req.company.id],
  );
  const { companyAvailableBalance } = await import('../services/companyPayoutService.js');
  const available = await companyAvailableBalance(null, req.company.id);
  const payoutRequests = await query(
    `select id, amount, mpesa_number, status, provider_reference, currency, created_at, updated_at
     from payouts where company_id = $1 order by created_at desc limit 25`,
    [req.company.id],
  );
  const company = await getCompany(req.company.id);
  res.json({
    success: true,
    summary: {
      gross: Number(summary.rows[0]?.gross || 0),
      commission: Number(summary.rows[0]?.commission || 0),
      net: Number(summary.rows[0]?.net || 0),
      pending: Number(summary.rows[0]?.pending || 0),
      paid: Number(summary.rows[0]?.paid || 0),
      availableForWithdrawal: available,
    },
    payoutAccount: {
      method: company?.payout_method || 'mpesa',
      mpesaNumber: maskAccount(company?.payout_mpesa_number),
      bankName: company?.payout_bank_name || null,
      bankAccount: maskAccount(company?.payout_bank_account),
      accountName: company?.payout_account_name || null,
    },
    payoutRequests: payoutRequests.rows,
    settlements: settlements.rows,
    monthly: monthly.rows,
  });
}

// ── Payout destination (owner / manage_settings) ──
export async function portalUpdatePayoutDestination(req, res) {
  if (!hasCapability(req.companyMembership, 'manage_settings')) {
    throw forbidden('Only company owners/managers can change the payout destination');
  }
  const b = req.body || {};
  const method = ['mpesa', 'bank'].includes(b.method) ? b.method : 'mpesa';
  if (method === 'mpesa' && !b.mpesaNumber && !req.company.payout_mpesa_number) {
    throw badRequest('mpesaNumber is required for M-Pesa payouts');
  }
  if (method === 'bank' && (!b.bankName || !b.bankAccount) && (!req.company.payout_bank_name || !req.company.payout_bank_account)) {
    throw badRequest('bankName and bankAccount are required for bank payouts');
  }
  const result = await query(
    `update company_profiles set
       payout_method = $2,
       payout_mpesa_number = coalesce($3, payout_mpesa_number),
       payout_bank_name = coalesce($4, payout_bank_name),
       payout_bank_account = coalesce($5, payout_bank_account),
       payout_account_name = coalesce($6, payout_account_name),
       updated_at = now()
     where id = $1 returning payout_method, payout_mpesa_number, payout_bank_name, payout_bank_account, payout_account_name`,
    [req.company.id, method, b.mpesaNumber || null, b.bankName || null, b.bankAccount || null, b.accountName || null],
  );
  await auditLog({
    userId: req.user.id, action: 'company.payout_destination.update', entityType: 'company', entityId: req.company.id,
    metadata: { method },
  });
  const row = result.rows[0];
  res.json({
    success: true,
    payoutAccount: {
      method: row.payout_method,
      mpesaNumber: maskAccount(row.payout_mpesa_number),
      bankName: row.payout_bank_name,
      bankAccount: maskAccount(row.payout_bank_account),
      accountName: row.payout_account_name,
    },
  });
}

// ── Withdraw pending settlements (finance roles; server-side balance math) ──
export async function portalWithdraw(req, res) {
  if (!hasCapability(req.companyMembership, 'request_payout')) {
    throw forbidden('Only owners/finance users can request settlement payouts');
  }
  const b = req.body || {};
  if (!b.amount) throw badRequest('amount is required');
  const { requestCompanyWithdrawal } = await import('../services/companyPayoutService.js');
  const { payout } = await requestCompanyWithdrawal({
    companyId: req.company.id,
    actorId: req.user.id,
    actorRole: `company:${req.companyMembership.role}`,
    amount: b.amount,
    mpesaNumber: b.mpesaNumber || undefined,
    bankName: b.bankName || undefined,
    bankAccount: b.bankAccount || undefined,
    idempotencyKey: b.idempotencyKey || req.get('Idempotency-Key') || undefined,
  });
  await auditLog({
    userId: req.user.id, action: 'company.payout.request', entityType: 'payout', entityId: payout.id,
    metadata: { companyId: req.company.id, amount: payout.amount, via: 'portal' },
  });
  res.status(201).json({ success: true, payout });
}

// ── Technician experience (spec §11) — only work assigned to them ──
export async function technicianAssignments(req, res) {
  const { scope = 'active' } = req.query || {};
  let where = `where j.technician_user_id = $1`;
  if (scope === 'active') where += ` and j.status in ('assigned','on_the_way','arrived','in_progress','completion_requested')`;
  else if (scope === 'completed') where += ` and j.status in ('completed','cancelled')`;
  const result = await query(
    `select j.id, j.status, j.service_category, j.description, j.urgency, j.location_name,
       j.customer_latitude, j.customer_longitude, j.scheduled_at, j.created_at,
       j.customer_completion_confirmed,
       u.full_name as customer_name, cp.company_name
     from jobs j join users u on u.id = j.customer_id
     left join company_profiles cp on cp.id = j.company_id
     ${where} order by j.created_at desc limit 50`,
    [req.user.id],
  );
  const membership = await getMembership(result.rows[0]?.company_id || null, req.user.id);
  res.json({ success: true, jobs: result.rows, myRole: membership?.role || 'technician' });
}

// Legacy secure overview (kept for compatibility, now enforced)
export async function getCompanyPortalOverview(req, res) {
  const companyId = req.params.companyId || req.query?.companyId;
  if (!companyId) throw badRequest('companyId is required');
  const company = await getCompany(companyId);
  if (!company) throw notFound('Company not found');
  const membership = await getMembership(companyId, req.user.id);
  const isStaff = ['super_admin', 'admin'].includes(req.user.role);
  if (!isStaff && (!membership || membership.status !== 'active')) {
    throw forbidden('You are not a member of this company');
  }
  req.company = company;
  req.companyMembership = membership || { role: 'platform_staff' };
  return portalOverview(req, res);
}

async function recordJobTimeline(jobId, eventType, actorId, actorRole, metadata = {}) {
  try {
    await query(
      `insert into job_timeline (job_id, event_type, actor_id, actor_role, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict do nothing`,
      [jobId, eventType, actorId, actorRole, JSON.stringify(metadata)],
    );
  } catch {
    // job_timeline table may not exist in older schemas — non-blocking
  }
}

// ── Admin: platform-wide company management (spec §14/§15) ──
export async function adminListCompanies(req, res) {
  const { status, search } = req.query || {};
  const params = [];
  let where = 'where 1=1';
  if (status) { params.push(status); where += ` and cp.status = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    where += ` and (cp.company_name ilike $${params.length} or cp.contact_email ilike $${params.length})`;
  }
  const result = await query(
    `select cp.*, u.full_name as owner_name, u.email as owner_email,
       (select count(*) from company_members cm where cm.company_id = cp.id) as member_count,
       (select count(*) from jobs j where j.company_id = cp.id) as job_count,
       (select count(*) from company_settlements s where s.company_id = cp.id and s.status = 'pending') as pending_settlements,
       (select coalesce(sum(s.net_amount), 0) from company_settlements s where s.company_id = cp.id and s.status = 'pending') as pending_settlements_kes
     from company_profiles cp left join users u on u.id = cp.owner_user_id
     ${where} order by cp.created_at desc limit 200`,
    params,
  );
  res.json({
    success: true,
    companies: result.rows.map((row) => ({
      ...toCompanySummary(row),
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      memberCount: Number(row.member_count || 0),
      jobCount: Number(row.job_count || 0),
      pendingSettlements: Number(row.pending_settlements || 0),
      pendingSettlementsKes: Number(row.pending_settlements_kes || 0),
    })),
  });
}

export async function adminCompanyAction(req, res) {
  const { action } = req.body || {};
  if (!['suspend', 'reactivate', 'reject'].includes(action)) throw badRequest('Invalid action');
  const company = await getCompany(req.params.id);
  if (!company) throw notFound('Company not found');
  const statusByAction = { suspend: 'suspended', reactivate: 'approved', reject: 'rejected' };
  const result = await query(
    `update company_profiles set status = $2, updated_at = now() where id = $1 returning *`,
    [req.params.id, statusByAction[action]],
  );
  await auditLog({
    userId: req.user.id, action: `company.${action}`, entityType: 'company', entityId: req.params.id,
    metadata: { companyName: company.company_name, reason: req.body?.reason || null },
  });
  await query(
    `insert into notifications (user_id, type, title, body, data)
     values ($1, 'company_status', 'Company Status Update', $2, $3::jsonb)`,
    [company.owner_user_id, `Your company "${company.company_name}" has been ${action}d by platform staff.`,
     JSON.stringify({ companyId: company.id, action })],
  );
  res.json({ success: true, company: toCompanySummary(result.rows[0]) });
}

// ── Admin: single-company drill-down (spec §14 detailed company management) ──
// Aggregates everything the platform knows about one company: profile,
// members, services, jobs, settlement ledger, payout requests, application.
export async function adminCompanyDetail(req, res) {
  const companyId = req.params.id;
  const company = await getCompany(companyId);
  if (!company) throw notFound('Company not found');

  const [members, services, jobs, settlementTotals, settlements, payoutRequests, application] = await Promise.all([
    query(
      `select cm.id, cm.user_id, cm.role, cm.status, cm.skills, cm.is_available, cm.permissions, cm.joined_at,
              u.full_name, u.email, u.phone as user_phone
       from company_members cm join users u on u.id = cm.user_id
       where cm.company_id = $1 order by cm.role, cm.joined_at`,
      [companyId],
    ),
    query(
      `select id, name, category, description, base_price, duration_minutes, is_active, created_at
       from company_services where company_id = $1 order by category, name`,
      [companyId],
    ),
    query(
      `select j.id, j.status, j.service_category, j.final_price, j.estimated_price,
              j.escrow_status, j.payment_status, j.created_at, j.updated_at,
              tech.full_name as technician_name, cust.full_name as customer_name
       from jobs j
       left join users tech on tech.id = j.technician_user_id
       left join users cust on cust.id = j.customer_id
       where j.company_id = $1 order by j.created_at desc limit 30`,
      [companyId],
    ),
    query(
      `select coalesce(sum(gross_amount), 0) as gross,
              coalesce(sum(commission_amount), 0) as commission,
              coalesce(sum(net_amount), 0) as net,
              coalesce(sum(net_amount) filter (where status = 'pending'), 0) as pending,
              coalesce(sum(net_amount) filter (where status = 'paid'), 0) as paid,
              count(*) filter (where status = 'pending') as pending_count
       from company_settlements where company_id = $1`,
      [companyId],
    ),
    query(
      `select s.*, j.service_category
       from company_settlements s left join jobs j on j.id = s.job_id
       where s.company_id = $1 order by s.created_at desc limit 50`,
      [companyId],
    ),
    query(
      `select id, amount, status, mpesa_number, provider_reference, currency, created_at, updated_at
       from payouts where company_id = $1 order by created_at desc limit 25`,
      [companyId],
    ),
    company.application_id
      ? query(
          `select id, company_name, status, company_registration_number, license_details, branches,
                  technician_count, review_notes, reviewed_by_user_id, approved_at, created_at
           from company_partner_applications where id = $1`,
          [company.application_id],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const totals = settlementTotals.rows[0] || {};
  const [ownerRow, payoutService] = await Promise.all([
    query('select full_name, email, phone from users where id = $1', [company.owner_user_id]),
    import('../services/companyPayoutService.js'),
  ]);
  const availableForWithdrawal = await payoutService.companyAvailableBalance(null, companyId);

  res.json({
    success: true,
    company: {
      ...toCompanySummary(company),
      legalName: company.legal_name,
      contactName: company.contact_name,
      contactEmail: company.contact_email,
      contactPhone: company.contact_phone,
      registrationNumber: company.registration_number,
      licenseDetails: company.license_details,
      teamSize: company.team_size ?? 0,
      payoutAccount: {
        method: company.payout_method || 'mpesa',
        mpesaNumber: maskAccount(company.payout_mpesa_number),
        bankName: company.payout_bank_name || null,
        bankAccount: maskAccount(company.payout_bank_account),
        accountName: company.payout_account_name || null,
      },
    },
    owner: ownerRow.rows[0]
      ? { fullName: ownerRow.rows[0].full_name, email: ownerRow.rows[0].email, phone: ownerRow.rows[0].phone }
      : null,
    members: members.rows.map((r) => ({
      id: r.id, userId: r.user_id, fullName: r.full_name, email: r.email,
      phone: r.phone || r.user_phone || null, role: r.role, status: r.status,
      skills: r.skills || [], isAvailable: r.is_available,
      permissions: r.permissions || null, joinedAt: r.joined_at,
    })),
    services: services.rows,
    jobs: jobs.rows,
    finance: {
      gross: Number(totals.gross || 0),
      commission: Number(totals.commission || 0),
      net: Number(totals.net || 0),
      pending: Number(totals.pending || 0),
      paid: Number(totals.paid || 0),
      pendingCount: Number(totals.pending_count || 0),
      availableForWithdrawal,
    },
    settlements: settlements.rows,
    payoutRequests: payoutRequests.rows,
    application: application.rows[0] || null,
  });
}
