import { query } from '../db.js';
import { auditLog } from '../services/auditService.js';
import { badRequest, forbidden, notFound, parseUuid } from '../utils/http.js';

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toCompanySummary(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    legalName: row.legal_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    companyRegistrationNumber: row.registration_number,
    businessCategories: normalizeJsonArray(row.business_categories),
    serviceAreas: normalizeJsonArray(row.service_areas),
    branches: normalizeJsonArray(row.branches),
    technicianCount: Number(row.technician_count || 0),
    licenseDetails: row.license_details,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPartnerApplicationSummary(row) {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    legalName: row.legal_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    companyRegistrationNumber: row.company_registration_number,
    businessCategories: normalizeJsonArray(row.business_categories),
    serviceAreas: normalizeJsonArray(row.service_areas),
    branches: normalizeJsonArray(row.branches),
    technicianCount: Number(row.technician_count || 0),
    licenseDetails: row.license_details,
    description: row.description,
    status: row.status,
    reviewNotes: row.review_notes,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPartnerApplication(req, res) {
  const payload = req.body || {};
  const userId = req.user?.id || payload.userId;
  const companyName = String(payload.companyName || payload.company_name || '').trim();
  const legalName = String(payload.legalName || payload.legal_name || companyName).trim();
  const contactName = String(payload.contactName || payload.contact_name || '').trim();
  const contactEmail = String(payload.contactEmail || payload.contact_email || '').trim();
  const contactPhone = String(payload.contactPhone || payload.contact_phone || '').trim();

  if (!userId) throw forbidden('Authentication required');
  if (!companyName || !legalName || !contactName || !contactEmail || !contactPhone) {
    throw badRequest('companyName, legalName, contactName, contactEmail, and contactPhone are required');
  }

  const result = await query(
    `insert into company_partner_applications (
      user_id, company_name, legal_name, contact_name, contact_email, contact_phone,
      company_registration_number, business_categories, service_areas, branches,
      technician_count, license_details, description, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'submitted') returning *`,
    [
      userId,
      companyName,
      legalName,
      contactName,
      contactEmail,
      contactPhone,
      payload.companyRegistrationNumber || payload.company_registration_number || null,
      Array.isArray(payload.businessCategories || payload.business_categories)
        ? (payload.businessCategories || payload.business_categories)
        : [],
      Array.isArray(payload.serviceAreas || payload.service_areas)
        ? (payload.serviceAreas || payload.service_areas)
        : [],
      Array.isArray(payload.branches) ? payload.branches : [],
      Number(payload.technicianCount || payload.technician_count || 0),
      payload.licenseDetails || payload.license_details || null,
      payload.description || null,
    ],
  );

  await auditLog({
    userId,
    action: 'company.application.create',
    entityType: 'company_application',
    entityId: result.rows[0].id,
    metadata: { companyName },
  });

  const response = { success: true, application: toPartnerApplicationSummary(result.rows[0]) };
  if (res) {
    res.status(201).json(response);
    return response;
  }
  return response;
}

export async function approvePartnerApplication(req, res) {
  const id = req.params?.id || req.body?.applicationId || req.body?.id;
  const actor = req.user;
  if (!actor || !['super_admin', 'admin'].includes(actor.role)) {
    throw forbidden('Only admin staff can approve partner applications');
  }
  const appResult = await query('select * from company_partner_applications where id = $1', [parseUuid(id, 'application id')]);
  if (!appResult.rows[0]) throw notFound('Partner application not found');

  const application = appResult.rows[0];
  const nextStatus = String(req.body?.status || 'approved').toLowerCase();
  if (!['approved', 'rejected', 'reviewing', 'archived'].includes(nextStatus)) {
    throw badRequest('Unsupported status');
  }

  const updated = await query(
    `update company_partner_applications
      set status = $2,
          review_notes = $3,
          reviewed_by_user_id = $4,
          approved_at = case when $2 = 'approved' and approved_at is null then now() else approved_at end,
          updated_at = now()
     where id = $1 returning *`,
    [application.id, nextStatus, req.body?.verificationNotes || req.body?.reviewNotes || null, actor.id],
  );

  let companyRow = null;
  if (nextStatus === 'approved') {
    const existingCompany = await query('select id from company_profiles where owner_user_id = $1 or application_id = $2 limit 1', [application.user_id, application.id]);
    if (!existingCompany.rows[0]) {
      const profileResult = await query(
        `insert into company_profiles (
          application_id, owner_user_id, company_name, legal_name, contact_name,
          contact_email, contact_phone, registration_number, business_categories,
          service_areas, branches, technician_count, license_details, description, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'approved') returning *`,
        [
          application.id,
          application.user_id,
          application.company_name,
          application.legal_name,
          application.contact_name,
          application.contact_email,
          application.contact_phone,
          application.company_registration_number,
          normalizeJsonArray(application.business_categories),
          normalizeJsonArray(application.service_areas),
          normalizeJsonArray(application.branches),
          Number(application.technician_count || 0),
          application.license_details,
          application.description,
        ],
      );
      companyRow = profileResult.rows[0];
    } else {
      companyRow = existingCompany.rows[0];
    }

    const memberCheck = await query('select id from company_members where company_id = $1 and user_id = $2 limit 1', [companyRow.id, application.user_id]);
    if (!memberCheck.rows[0]) {
      await query(
        `insert into company_members (company_id, user_id, role, status) values ($1, $2, 'owner', 'active') on conflict (company_id, user_id) do nothing`,
        [companyRow.id, application.user_id],
      );
    }
  }

  await auditLog({
    userId: actor.id,
    action: 'company.application.approve',
    entityType: 'company_application',
    entityId: application.id,
    metadata: { status: nextStatus },
  });

  const response = {
    success: true,
    application: toPartnerApplicationSummary(updated.rows[0]),
    company: companyRow ? toCompanySummary(companyRow) : null,
  };
  if (res) {
    res.json(response);
    return response;
  }
  return response;
}

export async function getCompanyPortalOverview(reqOrCtx, res) {
  const user = reqOrCtx?.user || reqOrCtx?.auth?.user;
  const companyId = reqOrCtx?.companyId || reqOrCtx?.params?.companyId || reqOrCtx?.query?.companyId;
  if (!companyId) throw badRequest('companyId is required');

  const companyResult = await query('select * from company_profiles where id = $1', [parseUuid(companyId, 'company id')]);
  if (!companyResult.rows[0]) throw notFound('Company not found');

  const company = companyResult.rows[0];
  const memberResult = await query('select role from company_members where company_id = $1 and user_id = $2 limit 1', [company.id, user?.id || null]);
  const canAccess = Boolean(
    !user ||
    user.role === 'super_admin' ||
    user.role === 'admin' ||
    company.owner_user_id === user?.id ||
    memberResult.rows[0],
  );

  const jobsResult = await query('select * from jobs where company_id = $1 order by created_at desc limit 25', [company.id]);
  const totalJobs = jobsResult.rows.length;
  const activeJobs = jobsResult.rows.filter((row) => ['pending', 'matching', 'accepted', 'on_the_way', 'arrived', 'in_progress'].includes(row.status)).length;
  const completedJobs = jobsResult.rows.filter((row) => row.status === 'completed').length;
  const totalRevenue = jobsResult.rows.reduce((sum, row) => sum + Number(row.estimated_price || 0), 0);

  const response = {
    success: true,
    company: {
      ...toCompanySummary(company),
      companyId: company.id,
      canAccess,
      ownership: company.owner_user_id === user?.id,
    },
    summary: {
      totalJobs,
      activeJobs,
      completedJobs,
      totalRevenue,
      technicianCount: Number(company.technician_count || 0),
    },
    jobs: jobsResult.rows,
    access: { canAccess },
  };

  if (res) {
    res.json(response);
    return response;
  }
  return response;
}

export async function assignTechnicianToJob(req, res) {
  const user = req.user;
  const jobId = req.params?.id || req.params?.jobId || req.body?.jobId;
  const technicianId = req.body?.technicianId || req.body?.technician_id;

  if (!user) throw forbidden('Authentication required');
  if (!jobId) throw badRequest('job id is required');
  if (!technicianId) throw badRequest('technicianId is required');

  const jobResult = await query('select * from jobs where id = $1', [parseUuid(jobId, 'job id')]);
  if (!jobResult.rows[0]) throw notFound('Job not found');

  const job = jobResult.rows[0];
  if (!job.company_id) {
    if (res) {
      res.status(403).json({ success: false, message: 'This job is not attached to a company profile' });
      return { success: false, statusCode: 403 };
    }
    return { success: false, statusCode: 403, message: 'This job is not attached to a company profile' };
  }

  const companyAccess = await query(
    `select role from company_members where company_id = $1 and user_id = $2 limit 1`,
    [job.company_id, user.id],
  );
  const allowsAssignment = user.role === 'super_admin' || user.role === 'admin' || companyAccess.rows[0]?.role === 'owner' || companyAccess.rows[0]?.role === 'manager';

  if (!allowsAssignment) {
    if (res) {
      res.status(403).json({ success: false, message: 'Only company owners and managers can assign technicians' });
      return { success: false, statusCode: 403 };
    }
    return { success: false, statusCode: 403, message: 'Only company owners and managers can assign technicians' };
  }

  const technicianMembership = await query(
    `select id from company_members where company_id = $1 and user_id = $2 and status = 'active' limit 1`,
    [job.company_id, technicianId],
  );

  if (!technicianMembership.rows[0]) {
    if (res) {
      res.status(403).json({ success: false, message: 'Technician is not assigned to this company' });
      return { success: false, statusCode: 403 };
    }
    return { success: false, statusCode: 403, message: 'Technician is not assigned to this company' };
  }

  const updated = await query(
    `update jobs
      set fundi_id = $2,
          technician_user_id = $2,
          status = 'assigned',
          updated_at = now()
     where id = $1 returning *`,
    [job.id, technicianId],
  );

  await auditLog({
    userId: user.id,
    action: 'company.job.assign_technician',
    entityType: 'job',
    entityId: job.id,
    metadata: { companyId: job.company_id, technicianId },
  });

  const response = { success: true, job: updated.rows[0] };
  if (res) {
    res.json(response);
    return response;
  }
  return response;
}
