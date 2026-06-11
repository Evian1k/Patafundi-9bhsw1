import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { badRequest } from '../utils/http.js';
import { uploadPrivateFile } from './storageService.js';
import { mapMulterFile } from '../middleware/upload.js';
import { runIdentityVerification } from './identityVerificationService.js';

function parseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function fileByField(files, names) {
  const list = files || [];
  for (const name of names) {
    const f = list.find((x) => x.fieldname === name);
    if (f) return mapMulterFile(f);
  }
  return null;
}

async function saveVerificationDoc(client, { fundiId, userId, documentType, file }) {
  if (!file) return null;
  const uploaded = await uploadPrivateFile({
    folder: `verification/${userId}`,
    file,
    allowPdf: documentType === 'certificate' || documentType === 'business_permit',
  });
  const result = await client.query(
    `insert into verification_documents (fundi_id, user_id, document_type, r2_key, mime_type, file_size, original_name, width, height, uploaded_by, blur_score, perceptual_hash, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2, $10, $11, 'pending')
     on conflict (fundi_id, document_type) do update set
       r2_key = excluded.r2_key,
       mime_type = excluded.mime_type,
       file_size = excluded.file_size,
       original_name = excluded.original_name,
       width = excluded.width,
       height = excluded.height,
       blur_score = excluded.blur_score,
       perceptual_hash = excluded.perceptual_hash,
       status = 'pending',
       created_at = now()
     returning *`,
    [
      fundiId,
      userId,
      documentType,
      uploaded.r2Key,
      uploaded.mimeType,
      uploaded.fileSize,
      file.originalname,
      uploaded.width,
      uploaded.height,
      uploaded.blurScore,
      uploaded.perceptualHash,
    ],
  );
  return result.rows[0];
}

export async function createFundiRegistration({ body, files, existingUserId = null }) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password;
  const fullName = String(body.fullName || body.full_name || `${body.firstName || ''} ${body.lastName || ''}`.trim()).trim();
  const phone = body.phone || body.mpesaNumber || body.mpesa_number || null;
  const skills = parseSkills(body.skills);
  const county = body.county || body.locationCounty || null;
  const town = body.town || body.locationCity || body.locationTown || null;

  if (!email || !password || !fullName) {
    throw badRequest('Email, password, and full name are required');
  }
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  const idFront = fileByField(files, ['idPhoto', 'id_photo', 'idFront']);
  const idBack = fileByField(files, ['idPhotoBack', 'id_photo_back', 'idBack']);
  const selfie = fileByField(files, ['selfiePhoto', 'selfie_photo', 'selfie']);
  const certificate = fileByField(files, ['certificate', 'certificates']);

  if (!idFront) throw badRequest('National ID front is required');
  if (!selfie) throw badRequest('Selfie is required for verification');

  const otpCode = String(crypto.randomInt(100000, 999999));

  const result = await transaction(async (client) => {
    let userId = existingUserId;
    if (!userId) {
      const existing = await client.query('select id from users where lower(email) = lower($1)', [email]);
      if (existing.rows[0]) throw badRequest('Email is already registered. Sign in or use a different email.');
      const passwordHash = await bcrypt.hash(password, 12);
      const inserted = await client.query(
        `insert into users (email, password_hash, full_name, phone, role, status)
         values ($1, $2, $3, $4, 'fundi_pending', 'active')
         returning id, email, full_name, phone, role, status, trust_score, email_verified_at`,
        [email, passwordHash, fullName, phone],
      );
      userId = inserted.rows[0].id;
      await client.query(
        `insert into trust_scores (user_id, score, level) values ($1, 100, 'standard')`,
        [userId],
      );
      await client.query(
        `insert into user_fraud_scores (user_id, fraud_score, risk_level) values ($1, 0, 'low')`,
        [userId],
      );
    } else {
      await client.query(
        `update users set role = 'fundi_pending', updated_at = now() where id = $1`,
        [userId],
      );
    }

    const fundi = await client.query(
      `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, latitude, longitude, id_number, bio)
       values ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
       on conflict (user_id) do update set
         skills = excluded.skills,
         experience = excluded.experience,
         mpesa_number = excluded.mpesa_number,
         id_number = coalesce(excluded.id_number, fundis.id_number),
         latitude = coalesce(excluded.latitude, fundis.latitude),
         longitude = coalesce(excluded.longitude, fundis.longitude),
         approval_status = 'pending',
         updated_at = now()
       returning *`,
      [
        userId,
        skills,
        body.experience || '',
        body.mpesaNumber || body.mpesa_number || phone || '',
        body.latitude || null,
        body.longitude || null,
        body.idNumber || body.id_number || null,
        [county, town].filter(Boolean).join(', ') || null,
      ],
    );

    const fundiRow = fundi.rows[0];
    await saveVerificationDoc(client, { fundiId: fundiRow.id, userId, documentType: 'id_front', file: idFront });
    if (idBack) await saveVerificationDoc(client, { fundiId: fundiRow.id, userId, documentType: 'id_back', file: idBack });
    await saveVerificationDoc(client, { fundiId: fundiRow.id, userId, documentType: 'selfie_id', file: selfie });
    if (certificate) await saveVerificationDoc(client, { fundiId: fundiRow.id, userId, documentType: 'certificate', file: certificate });

    await client.query(
      `insert into otp_codes (user_id, purpose, code_hash, expires_at)
       values ($1, 'register', $2, now() + interval '10 minutes')`,
      [userId, await bcrypt.hash(otpCode, 10)],
    );

    const userRow = await client.query(
      'select id, email, full_name, phone, role, status, trust_score, email_verified_at from users where id = $1',
      [userId],
    );
    return { user: userRow.rows[0], fundi: fundiRow };
  });

  let verification = null;
  try {
    verification = await runIdentityVerification(result.fundi.id, result.user.id);
  } catch (err) {
    console.warn('[fundi-register] identity verification failed:', err.message);
  }

  return { ...result, verification, otpCode };
}
