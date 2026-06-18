import { query } from '../db.js';
import { forbidden, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';
import { hasPermission } from './rbac.js';

function clientIp(req) {
  return req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || null;
}

async function logDocumentAccess(req, { documentType, documentId, action = 'view', metadata = {} }) {
  await query(
    `insert into document_access_logs (user_id, document_type, document_id, action, ip_address, user_agent, metadata)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      req.user.id,
      documentType,
      documentId,
      action,
      clientIp(req),
      req.get('user-agent') || null,
      JSON.stringify(metadata),
    ],
  );
  await auditLog({
    userId: req.user.id,
    action: `storage.${documentType}.${action}`,
    entityType: documentType,
    entityId: documentId,
    metadata: { ip: clientIp(req), ...metadata },
  });
}

/**
 * Fundi verification docs: admin-only.
 * Accepts 'super_admin' (platform owner) and 'admin' (ops manager), plus
 * any staff role with the can_view_verification_documents permission.
 * This fixes the bug where super_admin was blocked because the check
 * only allowed role === 'admin' (the seeded owner is now super_admin).
 */
export async function requireAdminDocumentAccess(req, res, next) {
  try {
    const staffRoles = new Set(['super_admin', 'admin', 'fraud_analyst', 'auditor']);
    const isStaff = staffRoles.has(req.user?.role);
    const hasPerm = await hasPermission(req, 'can_view_verification_documents');
    if (!isStaff && !hasPerm) {
      throw forbidden('Verification documents are admin-only');
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Job photos: customer, assigned fundi, or admin */
export async function requireJobPhotoAccess(req, res, next) {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!jobId) throw forbidden('Job ID required');
    const result = await query('select customer_id, fundi_id from jobs where id = $1', [jobId]);
    const job = result.rows[0];
    if (!job) throw notFound('Job not found');
    if (req.user.role === 'admin') {
      req.jobAccess = job;
      return next();
    }
    if (job.customer_id === req.user.id || job.fundi_id === req.user.id) {
      req.jobAccess = job;
      return next();
    }
    throw forbidden('Not allowed to access job photos');
  } catch (err) {
    next(err);
  }
}

/** Dispute files: involved parties or admin */
export async function requireDisputeAccess(req, res, next) {
  try {
    const disputeId = req.params.disputeId || req.params.id;
    if (!disputeId) throw forbidden('Dispute ID required');
    const result = await query(
      `select d.id, d.opened_by, j.customer_id, j.fundi_id
       from disputes d join jobs j on j.id = d.job_id where d.id = $1`,
      [disputeId],
    );
    const dispute = result.rows[0];
    if (!dispute) throw notFound('Dispute not found');
    if (req.user.role === 'admin') {
      req.disputeAccess = dispute;
      return next();
    }
    const involved = [dispute.opened_by, dispute.customer_id, dispute.fundi_id].filter(Boolean);
    if (involved.includes(req.user.id)) {
      req.disputeAccess = dispute;
      return next();
    }
    throw forbidden('Not allowed to access dispute files');
  } catch (err) {
    next(err);
  }
}

/** Chat attachments: same as job access */
export async function requireChatAttachmentAccess(req, res, next) {
  return requireJobPhotoAccess(req, res, next);
}

/** Profile photos: public for approved fundis; own profile for fundi; admin always */
export async function requireProfilePhotoAccess(req, res, next) {
  try {
    const userId = req.params.userId || req.params.id;
    if (req.user.role === 'admin' || req.user.id === userId) {
      return next();
    }
    const fundi = await query(
      `select f.approval_status from fundis f where f.user_id = $1 and f.approval_status = 'approved'`,
      [userId],
    );
    if (fundi.rows[0]) return next();
    throw forbidden('Not allowed to view this profile photo');
  } catch (err) {
    next(err);
  }
}

export { logDocumentAccess };
