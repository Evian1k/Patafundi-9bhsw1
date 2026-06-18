import { query, transaction } from '../db.js';
import {
  getObjectBuffer,
  hashSimilarityPercent,
  uploadProfilePhoto,
  computePerceptualHash,
} from './storageService.js';
import { auditLog } from './auditService.js';
import { config } from '../config.js';

const STRONG_MATCH = 90;
const REVIEW_REQUIRED = 75;
const AUTO_APPROVE_FACE = 95;
const AUTO_APPROVE_LIVENESS = 95;
const AUTO_APPROVE_FRAUD_MAX = 10;

function classifyMatch(score) {
  if (score >= STRONG_MATCH) return 'strong_match';
  if (score >= REVIEW_REQUIRED) return 'review_required';
  return 'suspicious';
}

function classifyVerificationResult(faceMatch, liveness, fraudRisk) {
  if (faceMatch >= AUTO_APPROVE_FACE && liveness >= AUTO_APPROVE_LIVENESS && fraudRisk <= AUTO_APPROVE_FRAUD_MAX) {
    return 'auto_approved';
  }
  if (faceMatch >= STRONG_MATCH && fraudRisk <= 25) return 'strong_match';
  if (faceMatch >= REVIEW_REQUIRED) return 'review_required';
  return 'suspicious';
}

async function compareFacesRekognition(idBuffer, selfieBuffer) {
  if (!config.aws?.rekognitionEnabled) return null;
  try {
    const { RekognitionClient, CompareFacesCommand } = await import('@aws-sdk/client-rekognition');
    const client = new RekognitionClient({ region: config.aws.region });
    const result = await client.send(new CompareFacesCommand({
      SourceImage: { Bytes: idBuffer },
      TargetImage: { Bytes: selfieBuffer },
      SimilarityThreshold: 70,
    }));
    const match = result.FaceMatches?.[0];
    return match ? Math.round(Number(match.Similarity)) : 0;
  } catch (err) {
    console.warn('[identity] Rekognition unavailable:', err.message);
    return null;
  }
}

async function compareFacesLocal(idBuffer, selfieBuffer) {
  const idHash = await computePerceptualHash(idBuffer);
  const selfieHash = await computePerceptualHash(selfieBuffer);
  return hashSimilarityPercent(idHash, selfieHash);
}

export async function compareIdAndSelfie(idR2Key, selfieR2Key) {
  const [idBuffer, selfieBuffer] = await Promise.all([
    getObjectBuffer(idR2Key),
    getObjectBuffer(selfieR2Key),
  ]);
  const rekognitionScore = await compareFacesRekognition(idBuffer, selfieBuffer);
  if (rekognitionScore != null) return rekognitionScore;
  return compareFacesLocal(idBuffer, selfieBuffer);
}

export async function detectDuplicateIdentity({ perceptualHash, userId, idNumber }) {
  const flags = [];
  if (perceptualHash) {
    const dupes = await query(
      `select vd.user_id, u.email, vd.perceptual_hash
       from verification_documents vd join users u on u.id = vd.user_id
       where vd.document_type in ('id_front', 'selfie_id')
         and vd.perceptual_hash is not null
         and vd.user_id <> $1`,
      [userId],
    );
    for (const row of dupes.rows) {
      const sim = hashSimilarityPercent(perceptualHash, row.perceptual_hash);
      if (sim >= 92) flags.push({ type: 'duplicate_selfie_or_id', matchedUserId: row.user_id, similarity: sim });
    }
  }
  if (idNumber) {
    const sameId = await query(
      `select f.user_id, u.email from fundis f join users u on u.id = f.user_id
       where f.id_number = $1 and f.user_id <> $2 and f.approval_status <> 'rejected'`,
      [idNumber, userId],
    );
    if (sameId.rows[0]) flags.push({ type: 'duplicate_id_number', matchedUserId: sameId.rows[0].user_id });
  }
  return flags;
}

export async function computeFraudRisk({ blurScore, duplicateFlags, faceMatchScore, livenessScore }) {
  let risk = 0;
  if (blurScore != null && blurScore < 15) risk += 25;
  if (duplicateFlags?.length) risk += duplicateFlags.length * 30;
  if (faceMatchScore != null && faceMatchScore < REVIEW_REQUIRED) risk += 40;
  if (livenessScore != null && livenessScore < 80) risk += 30;
  return Math.min(100, risk);
}

export async function runIdentityVerification(fundiId, userId) {
  const docs = await query(
    `select id, document_type, r2_key, blur_score, perceptual_hash
     from verification_documents where fundi_id = $1`,
    [fundiId],
  );
  const byType = Object.fromEntries(docs.rows.map((d) => [d.document_type, d]));
  const idFront = byType.id_front;
  const selfie = byType.selfie_id || byType.selfie;
  if (!idFront?.r2_key || !selfie?.r2_key) {
    return { success: false, reason: 'ID front and selfie required' };
  }

  const fundi = await query('select id_number from fundis where id = $1', [fundiId]);
  const faceMatchScore = await compareIdAndSelfie(idFront.r2_key, selfie.r2_key);
  const duplicateFlags = await detectDuplicateIdentity({
    perceptualHash: selfie.perceptual_hash || idFront.perceptual_hash,
    userId,
    idNumber: fundi.rows[0]?.id_number,
  });
  const blurScore = Math.min(idFront.blur_score ?? 100, selfie.blur_score ?? 100);
  const fraudRiskScore = await computeFraudRisk({ blurScore, duplicateFlags, faceMatchScore });
  const verificationResult = classifyMatch(faceMatchScore);
  const reviewStatus = verificationResult;

  await transaction(async (client) => {
    await client.query(
      `update verification_documents set face_match_score = $2, verification_result = $3, status = 'pending'
       where fundi_id = $1 and document_type in ('id_front', 'selfie_id')`,
      [fundiId, faceMatchScore, verificationResult],
    );
    await client.query(
      `update fundis set face_match_score = $2, fraud_risk_score = $3, verification_result = $4,
        verification_review_status = $5, updated_at = now() where id = $1`,
      [fundiId, faceMatchScore, fraudRiskScore, verificationResult, reviewStatus],
    );
    await client.query(
      `update users set face_match_score = $2, fraud_risk_score = $3, verification_status = $4, updated_at = now()
       where id = $1`,
      [userId, faceMatchScore, fraudRiskScore, reviewStatus === 'strong_match' ? 'pending' : 'review_required'],
    );
  });

  if (duplicateFlags.length) {
    await auditLog({
      userId,
      action: 'identity.duplicate_detected',
      entityType: 'fundi',
      entityId: fundiId,
      metadata: { flags: duplicateFlags, faceMatchScore },
    });
  }

  return {
    success: true,
    faceMatchScore,
    fraudRiskScore,
    verificationResult,
    reviewStatus,
    duplicateFlags,
    blurScore,
  };
}

export async function tryAutoApprove(fundiId, userId, adminUserId = null) {
  const fundi = await query(
    `select f.*, u.verification_status from fundis f join users u on u.id = f.user_id where f.id = $1`,
    [fundiId],
  );
  const row = fundi.rows[0];
  if (!row) return { autoApproved: false };

  const face = Number(row.face_match_score || 0);
  const liveness = Number(row.liveness_score || 0);
  const fraud = Number(row.fraud_risk_score || 100);

  if (face < AUTO_APPROVE_FACE || liveness < AUTO_APPROVE_LIVENESS || fraud > AUTO_APPROVE_FRAUD_MAX) {
    return { autoApproved: false, reason: 'Scores below auto-approve threshold' };
  }

  const selfie = await query(
    `select r2_key from verification_documents where fundi_id = $1 and document_type = 'selfie_id' limit 1`,
    [fundiId],
  );
  let profileR2Key = null;
  let profileThumbKey = null;
  if (selfie.rows[0]?.r2_key) {
    const buffer = await getObjectBuffer(selfie.rows[0].r2_key);
    const profile = await uploadProfilePhoto({ userId: row.user_id, buffer });
    profileR2Key = profile.r2Key;
    profileThumbKey = profile.thumbR2Key;
  }

  await transaction(async (client) => {
    await client.query(
      `update fundis set approval_status = 'approved', approved_at = now(), verification_badge = true,
        verification_review_status = 'approved', profile_photo_url = $2, profile_photo_thumb_url = $3, updated_at = now()
       where id = $1`,
      [fundiId, profileR2Key, profileThumbKey],
    );
    await client.query(
      `update users set role = 'fundi', status = 'active', verification_status = 'verified',
        verified_at = now(), updated_at = now() where id = $1`,
      [row.user_id],
    );
    await client.query(
      `update verification_documents set status = 'approved' where fundi_id = $1`,
      [fundiId],
    );
  });

  await auditLog({
    userId: adminUserId || row.user_id,
    action: 'identity.auto_approved',
    entityType: 'fundi',
    entityId: fundiId,
    metadata: { faceMatchScore: face, livenessScore: liveness, fraudRiskScore: fraud },
  });

  return { autoApproved: true, faceMatchScore: face, livenessScore: liveness };
}

export {
  classifyMatch,
  classifyVerificationResult,
  STRONG_MATCH,
  REVIEW_REQUIRED,
  AUTO_APPROVE_FACE,
  AUTO_APPROVE_LIVENESS,
  AUTO_APPROVE_FRAUD_MAX,
};
