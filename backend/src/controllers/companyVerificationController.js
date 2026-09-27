// Company document verification workflow (spec sections 19-22, 26, 48).
//
// REGISTERED → APPLICATION_SUBMITTED → DOCUMENTS_PENDING → UNDER_REVIEW →
// VERIFIED / REJECTED → (subscription when required) → ACTIVE
//
// A company is VERIFIED only after an admin has reviewed the required
// documents. Uploads alone never flip verification status, and OCR/AI
// extraction is metadata only - it can never auto-approve anything.
import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { emitEvent } from '../realtime.js';

const COMPANY_DOC_TYPES = [
  'company_registration', 'owner_id', 'tax_registration',
  'address_evidence', 'professional_license', 'insurance', 'other',
];

// Required documents for a company in a country (configurable, spec section 19).
export async function getRequiredDocuments(companyId, countryCode = '*') {
  const res = await query(
    `select document_type, is_required from verification_requirements
     where subject_type = 'company' and country_code in ('*', $1)`,
    [countryCode || '*'],
  );
  const byType = new Map();
  // Country-specific rows override the global default.
  for (const row of res.rows) byType.set(row.document_type, row.is_required);
  return [...byType.entries()]
    .filter(([, required]) => required)
    .map(([documentType]) => documentType);
}

function companyDocPublic(row) {
  return {
    id: row.id,
    documentType: row.document_type,
    document_type: row.document_type,
    status: row.status,
    originalName: row.original_name,
    rejectionReason: row.rejection_reason,
    reviewerUserId: row.reviewer_user_id,
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    extractedData: row.extracted_data || {},
    createdAt: row.created_at,
  };
}

/**
 * Owner/manager uploads a company document. Accepts either an uploaded file
 * (req.file from imageUpload.single) or a previously stored R2 key.
 */
export async function uploadCompanyDocument(req, res) {
  const company = req.company;
  if (!company?.id) throw forbidden('Company context is required');
  if (!['owner', 'manager', 'admin'].includes(req.companyMembership.role)) {
    throw forbidden('Only company owners/managers can upload documents');
  }
  const documentType = String(req.body?.documentType || '').trim();
  if (!COMPANY_DOC_TYPES.includes(documentType)) {
    throw badRequest(`documentType must be one of: ${COMPANY_DOC_TYPES.join(', ')}`);
  }
  const { uploadPrivateFile } = await import('../services/storageService.js');
  if (!req.file && !req.body?.storageKey) throw badRequest('A document file is required');
  let storageKey = req.body?.storageKey || null;
  let mimeType = req.body?.mimeType || 'application/pdf';
  let fileSize = Number(req.body?.fileSize || 0);
  let originalName = req.body?.originalName || documentType;
  if (req.file) {
    const stored = await uploadPrivateFile({
      folder: `verification/company/${company.id}`,
      file: req.file,
      allowPdf: true,
    });
    storageKey = stored.r2Key;
    mimeType = req.file.mimetype;
    fileSize = req.file.size;
    originalName = req.file.originalname;
  }
  if (!storageKey) throw badRequest('Document storage failed');

  // One document per type: replace the previous (kept for audit via updated row).
  const existing = await query(
    `select id from verification_documents where company_id = $1 and document_type = $2`,
    [company.id, documentType],
  );
  let row;
  if (existing.rows[0]) {
    const updated = await query(
      `update verification_documents set r2_key = $3, mime_type = $4, file_size = $5,
         original_name = $6, status = 'pending', rejection_reason = null,
         reviewer_user_id = null, reviewed_at = null,
         uploaded_by = $7, created_at = now(), expires_at = null,
         extracted_data = '{}'::jsonb, verification_metadata = '{}'::jsonb
       where id = $1 and company_id = $2 returning *`,
        [existing.rows[0].id, company.id, storageKey, mimeType, fileSize, originalName, req.user.id],
      );
    row = updated.rows[0];
  } else {
    const inserted = await query(
      `insert into verification_documents
         (owner_type, company_id, fundi_id, user_id, document_type, r2_key, mime_type,
          file_size, original_name, status, uploaded_by, created_at)
       values ('company', $1, null, $2, $3, $4, $5, $6, $7, 'pending', $8, now())
       returning *`,
      [company.id, req.user.id, documentType, storageKey, mimeType, fileSize, originalName, req.user.id],
    );
    row = inserted.rows[0];
  }

  // Documents present → the application leaves DOCUMENTS_PENDING.
  await query(
    `update company_profiles set documents_status = 'pending', updated_at = now() where id = $1`,
    [company.id],
  );
  await auditLog({
    userId: req.user.id,
    action: 'company.document.uploaded',
    entityType: 'verification_document',
    entityId: row.id,
    metadata: { companyId: company.id, documentType },
  });
  res.status(201).json({ success: true, document: companyDocPublic(row) });
}

export async function listCompanyDocuments(req, res) {
  const company = req.company;
  if (!company?.id) throw forbidden('Company context is required');
  const docs = await query(
    `select * from verification_documents where company_id = $1 order by created_at desc`,
    [company.id],
  );
  const required = await getRequiredDocuments(company.id, company.country_code || '*');
  // "missing" = no document row at all or the last one was rejected/expired
  // (i.e. the company must upload or re-upload before submitting).
  const missingDocuments = required.filter((t) => {
    const rows = docs.rows.filter((d) => d.document_type === t);
    if (!rows.length) return true;
    return rows.every((d) => ['rejected', 'expired'].includes(d.status));
  });
  const verifiedCount = docs.rows.filter((d) => ['verified', 'approved'].includes(d.status)).length;
  res.json({
    success: true,
    documents: docs.rows.map(companyDocPublic),
    requiredDocuments: required,
    missingDocuments,
    verifiedDocuments: verifiedCount,
    verificationStatus: company.verification_status,
    documentsStatus: company.documents_status,
  });
}

/**
 * Company submits itself for verification: requires all required documents
 * present. Moves verification_status → under_review and notifies admins
 * (spec section 21/27: "Company Documents Ready for Review").
 */
export async function submitForVerification(req, res) {
  const company = req.company;
  if (!company?.id) throw forbidden('Company context is required');
  if (!['owner', 'manager', 'admin'].includes(req.companyMembership.role)) {
    throw forbidden('Only company owners/managers can submit for verification');
  }
  if (company.verification_status === 'verified') {
    throw badRequest('Company is already verified');
  }
  if (company.status === 'suspended') throw badRequest('Suspended companies cannot submit for verification');
  const docs = await query(
    `select document_type, status from verification_documents where company_id = $1`,
    [company.id],
  );
  const required = await getRequiredDocuments(company.id, company.country_code || '*');
  const verifiedTypes = new Set(
    docs.rows.filter((d) => ['verified', 'approved'].includes(d.status)).map((d) => d.document_type),
  );
  const missing = required.filter((t) => {
    const rows = docs.rows.filter((d) => d.document_type === t);
    if (!rows.length) return true;
    return rows.every((d) => ['rejected', 'expired'].includes(d.status));
  });
  if (missing.length) {
    throw badRequest(`Missing required documents: ${missing.join(', ')}`);
  }
  const updated = await query(
    `update company_profiles set verification_status = 'under_review',
       documents_status = 'under_review', submitted_at = now(), updated_at = now()
     where id = $1 returning *`,
    [company.id],
  );
  await query(
    `update verification_documents set status = 'under_review'
     where company_id = $1 and status in ('pending', 'reupload_requested')`,
    [company.id],
  );
  await auditLog({
    userId: req.user.id,
    action: 'company.verification.submitted',
    entityType: 'company_profile',
    entityId: company.id,
  });
  // Admin notifications (spec section 27): every admin/super_admin.
  const admins = await query(
    `select id from users where role in ('admin', 'super_admin') and status = 'active' limit 20`,
  );
  for (const admin of admins.rows) {
    await query(
      `insert into notifications (user_id, type, title, body, data, category, severity)
       values ($1, 'company_verification_submitted', 'Company Documents Ready for Review', $2, $3::jsonb, 'verification', 'high')`,
      [admin.id,
       `${company.company_name} submitted its verification documents for review.`,
       JSON.stringify({ companyId: company.id })],
    ).catch(() => {});
  }
  emitEvent('company:verification:submitted', { companyId: company.id }, 'admin');
  res.json({ success: true, company: updated.rows[0] });
}

// ───────────────────────────────────────────── ADMIN REVIEW ENDPOINTS ──

export async function adminVerificationQueue(req, res) {
  const { status = 'under_review' } = req.query || {};
  const res1 = await query(
    `select cp.id, cp.company_name, cp.legal_name, cp.contact_email, cp.contact_phone,
       cp.verification_status, cp.documents_status, cp.status, cp.created_at, cp.submitted_at,
       u.full_name as owner_name, u.email as owner_email,
       (select count(*) from verification_documents vd where vd.company_id = cp.id) as document_count,
       (select count(*) from verification_documents vd where vd.company_id = cp.id and vd.status = 'verified') as verified_documents
     from company_profiles cp
     join users u on u.id = cp.owner_user_id
     where ($1 = 'all' or cp.verification_status = $1)
     order by cp.submitted_at desc nulls last, cp.created_at desc limit 100`,
    [status],
  );
  res.json({ success: true, companies: res1.rows });
}

export async function adminCompanyVerificationDetail(req, res) {
  const companyRes = await query(
    `select cp.*, u.full_name as owner_name, u.email as owner_email, u.phone as owner_phone
     from company_profiles cp join users u on u.id = cp.owner_user_id
     where cp.id = $1`,
    [req.params.id],
  );
  const company = companyRes.rows[0];
  if (!company) throw notFound('Company not found');
  const docs = await query(
    `select vd.*, ru.full_name as reviewer_name
     from verification_documents vd
     left join users ru on ru.id = vd.reviewer_user_id
     where vd.company_id = $1 order by vd.created_at desc`,
    [company.id],
  );
  const required = await getRequiredDocuments(company.id, company.country_code || '*');
  res.json({
    success: true,
    company: { ...company, password_hash: undefined },
    documents: docs.rows.map((d) => ({
      id: d.id, documentType: d.document_type, status: d.status,
      originalName: d.original_name, mimeType: d.mime_type, fileSize: d.file_size,
      rejectionReason: d.rejection_reason, reviewerName: d.reviewer_name,
      reviewedAt: d.reviewed_at, expiresAt: d.expires_at,
      extractedData: d.extracted_data || {}, verificationMetadata: d.verification_metadata || {},
      createdAt: d.created_at,
    })),
    requiredDocuments: required,
  });
}

/**
 * Admin document review: verified / rejected / request more info. Records the
 * reviewer, timestamp and reason (spec section 22/26). Documents are NEVER
 * auto-approved by OCR results.
 */
export async function adminReviewDocument(req, res) {
  const { decision, reason } = req.body || {};
  if (!['verify', 'reject', 'request_info'].includes(decision)) {
    throw badRequest('decision must be verify, reject or request_info');
  }
  const docRes = await query(
    `select vd.*, cp.company_name from verification_documents vd
     left join company_profiles cp on cp.id = vd.company_id
     where vd.id = $1 and vd.company_id is not null`,
    [req.params.id],
  );
  const doc = docRes.rows[0];
  if (!doc) throw notFound('Document not found');
  const status = decision === 'verify' ? 'verified' : decision === 'reject' ? 'rejected' : 'reupload_requested';
  const updated = await query(
    `update verification_documents set status = $2, reviewer_user_id = $3, reviewed_at = now(),
       rejection_reason = $4, updated_at = now()
     where id = $1 returning *`,
    [doc.id, status, req.user.id, decision === 'verify' ? null : (reason || null)],
  );
  await auditLog({
    userId: req.user.id,
    action: `company.document.${status}`,
    entityType: 'verification_document',
    entityId: doc.id,
    metadata: { companyId: doc.company_id, companyName: doc.company_name, reason: reason || null },
  });
  // Notify the company owner (spec section 27).
  if (doc.company_id) {
    const owner = await query('select owner_user_id from company_profiles where id = $1', [doc.company_id]);
    if (owner.rows[0]) {
      const title = status === 'verified' ? 'Document verified'
        : status === 'rejected' ? 'Document rejected' : 'More information needed';
      const body = status === 'verified'
        ? `Your ${doc.document_type.replace(/_/g, ' ')} for ${doc.company_name} was verified.`
        : status === 'rejected'
          ? `Your ${doc.document_type.replace(/_/g, ' ')} for ${doc.company_name} was rejected.${reason ? ` Reason: ${reason}` : ''}`
          : `Please re-upload your ${doc.document_type.replace(/_/g, ' ')} for ${doc.company_name}.${reason ? ` Note: ${reason}` : ''}`;
      await query(
        `insert into notifications (user_id, type, title, body, data, category)
         values ($1, 'company_document_review', $2, $3, $4::jsonb, 'verification')`,
        [owner.rows[0].owner_user_id, title, body,
         JSON.stringify({ companyId: doc.company_id, documentId: doc.id, status })],
      ).catch(() => {});
    }
  }
  res.json({ success: true, document: companyDocPublic(updated.rows[0]) });
}

/**
 * Admin company verification decision. Requires every required document to be
 * verified before the company can be marked verified (spec sections 21, 48).
 */
export async function adminVerifyCompany(req, res) {
  const { decision, reason } = req.body || {};
  if (!['verify', 'reject'].includes(decision)) throw badRequest('decision must be verify or reject');
  const companyRes = await query('select * from company_profiles where id = $1', [req.params.id]);
  const company = companyRes.rows[0];
  if (!company) throw notFound('Company not found');

  let verificationStatus;
  if (decision === 'verify') {
    const docs = await query(
      `select document_type, status from verification_documents where company_id = $1`,
      [company.id],
    );
    const required = await getRequiredDocuments(company.id, company.country_code || '*');
    const verifiedTypes = new Set(docs.rows.filter((d) => d.status === 'verified').map((d) => d.document_type));
    const missing = required.filter((t) => !verifiedTypes.has(t));
    if (missing.length) {
      throw badRequest(`Cannot verify: required documents not yet verified (${missing.join(', ')})`);
    }
    verificationStatus = 'verified';
  } else {
    verificationStatus = 'rejected';
  }

  const updated = await query(
    `update company_profiles set verification_status = $2,
       documents_status = $2,
       verification_notes = $3,
       verified_at = case when $2 = 'verified' then now() else null end,
       updated_at = now()
     where id = $1 returning *`,
    [company.id, verificationStatus, reason || company.verification_notes],
  );
  await auditLog({
    userId: req.user.id,
    action: `company.verification.${verificationStatus}`,
    entityType: 'company_profile',
    entityId: company.id,
    metadata: { companyName: company.company_name, reason: reason || null },
  });
  const title = verificationStatus === 'verified' ? 'Company verified' : 'Company Application Requires Attention';
  const body = verificationStatus === 'verified'
    ? `${company.company_name} passed verification. Your services are now eligible for the marketplace (subscription may still be required).`
    : `${company.company_name} verification was not approved.${reason ? ` Reason: ${reason}` : ' Update your documents and submit again.'}`;
  await query(
    `insert into notifications (user_id, type, title, body, data, category, severity)
     values ($1, 'company_verification_decision', $2, $3, $4::jsonb, 'verification', $5)`,
    [company.owner_user_id, title, body,
     JSON.stringify({ companyId: company.id, status: verificationStatus }),
     verificationStatus === 'verified' ? 'normal' : 'high'],
  ).catch(() => {});
  res.json({ success: true, company: { ...updated.rows[0], password_hash: undefined } });
}

// ── Company branding (spec section 20): logo + profile/cover image upload ──
// Real uploaded images persisted through the storage service - never fake
// placeholder photos. Returns the stored URLs.
export async function uploadCompanyBranding(req, res) {
  const company = req.company;
  if (!company?.id) throw forbidden('Company context is required');
  if (!['owner', 'manager', 'admin'].includes(req.companyMembership.role)) {
    throw forbidden('Only company owners/managers can update branding');
  }
  const { uploadPrivateFile, getSignedAccessUrl } = await import('../services/storageService.js');
  const updates = {};
  const branding = {};
  for (const field of ['logo', 'cover']) {
    const file = req.files?.[field]?.[0];
    if (!file) continue;
    const stored = await uploadPrivateFile({
      folder: `company/${company.id}/branding`,
      file,
      allowPdf: false,
    });
    if (field === 'logo') updates.logo_url = stored.key;
    else updates.profile_image_url = stored.key;
  }
  if (!Object.keys(updates).length) {
    throw badRequest('Attach a logo and/or cover image to upload');
  }
  const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(
    `update company_profiles set ${sets}, updated_at = now() where id = $1`,
    [company.id, ...Object.values(updates)],
  );
  for (const [field, key] of Object.entries(updates)) {
    branding[field === 'logo_url' ? 'logoUrl' : 'profileImageUrl'] = await getSignedAccessUrl(key, 60 * 60);
  }
  await auditLog({
    userId: req.user.id,
    action: 'company.branding.updated',
    entityType: 'company_profile',
    entityId: company.id,
    metadata: { fields: Object.keys(updates) },
  });
  res.json({ success: true, branding });
}
