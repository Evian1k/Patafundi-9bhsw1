import { query } from '../db.js';
import { forbidden, notFound } from '../utils/http.js';
import { getSignedAccessUrl, getSignedThumbUrl, getObjectBuffer } from '../services/storageService.js';
import { logDocumentAccess } from '../middleware/storageAccess.js';

export async function getVerificationDocuments(req, res) {
  const fundiId = req.params.fundiId;
  const fundi = await query('select id, user_id from fundis where id = $1 or user_id = $1', [fundiId]);
  if (!fundi.rows[0]) throw notFound('Fundi not found');

  const docs = await query(
    `select id, document_type, r2_key, mime_type, file_size, original_name, face_match_score,
            verification_result, status, blur_score, created_at
     from verification_documents where fundi_id = $1 order by created_at`,
    [fundi.rows[0].id],
  );

  const documents = await Promise.all(docs.rows.map(async (doc) => {
    await logDocumentAccess(req, { documentType: 'verification_document', documentId: doc.id, action: 'signed_url_issued' });
    return {
      id: doc.id,
      documentType: doc.document_type,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      faceMatchScore: doc.face_match_score,
      verificationResult: doc.verification_result,
      status: doc.status,
      blurScore: doc.blur_score,
      createdAt: doc.created_at,
      signedUrl: await getSignedAccessUrl(doc.r2_key),
      expiresIn: 900,
    };
  }));

  res.json({ success: true, documents });
}

export async function getSignedDocumentUrl(req, res) {
  const doc = await query(
    `select vd.* from verification_documents vd where vd.id = $1`,
    [req.params.id],
  );
  if (!doc.rows[0]) throw notFound('Document not found');
  await logDocumentAccess(req, { documentType: 'verification_document', documentId: doc.rows[0].id, action: 'view' });
  const url = await getSignedAccessUrl(doc.rows[0].r2_key);
  res.json({ success: true, url, expiresIn: 900 });
}

export async function getJobPhotos(req, res) {
  const photos = await query(
    `select id, r2_key, thumb_r2_key, mime_type, file_size, original_name, sort_order, created_at
     from job_photos where job_id = $1 and status = 'active' order by sort_order, created_at`,
    [req.params.jobId],
  );

  const result = await Promise.all(photos.rows.map(async (p) => {
    await logDocumentAccess(req, { documentType: 'job_photo', documentId: p.id, action: 'view' });
    return {
      id: p.id,
      signedUrl: await getSignedAccessUrl(p.r2_key),
      thumbSignedUrl: await getSignedThumbUrl(p.thumb_r2_key, p.r2_key),
      mimeType: p.mime_type,
      fileSize: p.file_size,
      originalName: p.original_name,
      sortOrder: p.sort_order,
      expiresIn: 900,
    };
  }));

  res.json({ success: true, photos: result });
}

export async function getJobPhotoSignedUrl(req, res) {
  const photo = await query(
    `select * from job_photos where id = $1 and job_id = $2 and status = 'active'`,
    [req.params.photoId, req.params.jobId],
  );
  if (!photo.rows[0]) throw notFound('Photo not found');
  await logDocumentAccess(req, { documentType: 'job_photo', documentId: photo.rows[0].id, action: 'view' });
  const url = await getSignedAccessUrl(photo.rows[0].r2_key);
  res.json({ success: true, url, expiresIn: 900 });
}

export async function getDisputeFiles(req, res) {
  const files = await query(
    `select id, r2_key, thumb_r2_key, mime_type, file_size, original_name, created_at
     from dispute_files where dispute_id = $1 and status = 'active' order by created_at`,
    [req.params.disputeId],
  );

  const result = await Promise.all(files.rows.map(async (f) => {
    await logDocumentAccess(req, { documentType: 'dispute_file', documentId: f.id, action: 'view' });
    return {
      id: f.id,
      signedUrl: await getSignedAccessUrl(f.r2_key),
      thumbSignedUrl: await getSignedThumbUrl(f.thumb_r2_key, f.r2_key),
      mimeType: f.mime_type,
      expiresIn: 900,
    };
  }));

  res.json({ success: true, files: result });
}

export async function getProfilePhotoSignedUrl(req, res) {
  const userId = req.params.userId;
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    const approved = await query(
      `select 1 from fundis where user_id = $1 and approval_status = 'approved'`,
      [userId],
    );
    if (!approved.rows[0]) throw forbidden('Not allowed');
  }

  const fundi = await query(
    `select profile_photo_url, profile_photo_thumb_url from fundis where user_id = $1`,
    [userId],
  );
  const row = fundi.rows[0];
  if (!row?.profile_photo_url) throw notFound('Profile photo not found');

  await logDocumentAccess(req, { documentType: 'profile_photo', documentId: userId, action: 'view', metadata: { targetUserId: userId } });

  res.json({
    success: true,
    signedUrl: await getSignedAccessUrl(row.profile_photo_url),
    thumbSignedUrl: await getSignedThumbUrl(row.profile_photo_thumb_url, row.profile_photo_url),
    expiresIn: 900,
  });
}

export async function serveLocalFile(req, res) {
  const r2Key = decodeURIComponent(req.params.key || '');
  if (!r2Key || r2Key.includes('..')) throw forbidden('Invalid path');

  if (r2Key.startsWith('verification/') && req.user.role !== 'admin') throw forbidden('Admin only');

  const buffer = await getObjectBuffer(r2Key);
  res.setHeader('Cache-Control', 'private, no-store');
  res.type(r2Key.endsWith('.pdf') ? 'application/pdf' : r2Key.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
  res.send(buffer);
}

export async function getChatAttachmentSignedUrl(req, res) {
  const att = await query(
    `select ca.*, j.customer_id, j.fundi_id from chat_attachments ca
     join jobs j on j.id = ca.job_id where ca.id = $1 and ca.status = 'active'`,
    [req.params.attachmentId],
  );
  if (!att.rows[0]) throw notFound('Attachment not found');
  const row = att.rows[0];
  if (req.user.role !== 'admin' && req.user.id !== row.customer_id && req.user.id !== row.fundi_id) {
    throw forbidden('Not allowed');
  }
  await logDocumentAccess(req, { documentType: 'chat_attachment', documentId: row.id, action: 'view' });
  res.json({
    success: true,
    signedUrl: await getSignedAccessUrl(row.r2_key),
    expiresIn: 900,
  });
}
