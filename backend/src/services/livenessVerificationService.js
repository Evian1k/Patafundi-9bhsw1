import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { uploadPrivateFile, getObjectBuffer, hashSimilarityPercent } from './storageService.js';
import { compareIdAndSelfie, computeFraudRisk, tryAutoApprove, classifyVerificationResult } from './identityVerificationService.js';
import { auditLog } from './auditService.js';

const CHALLENGES = [
  { id: 'look_straight', label: 'Look directly at camera', durationMs: 2000 },
  { id: 'blink', label: 'Blink your eyes', durationMs: 2000 },
  { id: 'turn_left', label: 'Turn head left', durationMs: 2500 },
  { id: 'turn_right', label: 'Turn head right', durationMs: 2500 },
  { id: 'smile', label: 'Smile', durationMs: 2000 },
  { id: 'hold_still', label: 'Hold still', durationMs: 2000 },
];

const SESSION_TTL_MINUTES = 15;

export async function startLivenessSession(userId, fundiId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  await query(
    `insert into liveness_sessions (id, user_id, fundi_id, status, challenges, expires_at)
     values ($1, $2, $3, 'started', $4::jsonb, $5)`,
    [sessionId, userId, fundiId, JSON.stringify(CHALLENGES), expiresAt.toISOString()],
  );
  return { sessionId, challenges: CHALLENGES, expiresAt };
}

export async function uploadLivenessFrame(sessionId, userId, { challengeId, frameBuffer, clientConfidence = 0 }) {
  const session = await query(
    `select * from liveness_sessions where id = $1 and user_id = $2 and status in ('started', 'in_progress') and expires_at > now()`,
    [sessionId, userId],
  );
  if (!session.rows[0]) throw Object.assign(new Error('Liveness session expired or not found'), { status: 404 });

  const uploaded = await uploadPrivateFile({
    folder: `liveness/${sessionId}`,
    file: { buffer: frameBuffer, mimetype: 'image/jpeg', originalname: `${challengeId}.jpg` },
  });

  const frames = session.rows[0].frames || [];
  frames.push({
    challengeId,
    r2Key: uploaded.r2Key,
    perceptualHash: uploaded.perceptualHash,
    clientConfidence: Number(clientConfidence) || 0,
    capturedAt: new Date().toISOString(),
  });

  await query(
    `update liveness_sessions set status = 'in_progress', frames = $2::jsonb where id = $1`,
    [sessionId, JSON.stringify(frames)],
  );

  return { success: true, challengeId, frameCount: frames.length };
}

async function detectAntiSpoof(frames) {
  const flags = [];
  if (frames.length < CHALLENGES.length) flags.push('incomplete_challenges');

  const hashes = frames.map((f) => f.perceptualHash).filter(Boolean);
  for (let i = 1; i < hashes.length; i++) {
    const sim = hashSimilarityPercent(hashes[i - 1], hashes[i]);
    if (sim > 98) flags.push('identical_frames_suspected_screenshot');
  }

  const timestamps = frames.map((f) => new Date(f.capturedAt).getTime()).sort((a, b) => a - b);
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] < 300) flags.push('frames_too_fast');
  }

  const lowConfidence = frames.filter((f) => Number(f.clientConfidence) < 0.5);
  if (lowConfidence.length > 2) flags.push('low_client_confidence');

  return flags;
}

function computeLivenessScore(frames, antiSpoofFlags) {
  let score = 100;
  score -= antiSpoofFlags.length * 15;
  if (frames.length >= CHALLENGES.length) score += 0;
  else score -= (CHALLENGES.length - frames.length) * 10;
  const avgConfidence = frames.reduce((s, f) => s + (Number(f.clientConfidence) || 0), 0) / Math.max(frames.length, 1);
  score = score * 0.6 + avgConfidence * 100 * 0.4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function completeLivenessSession(sessionId, userId) {
  const session = await query(
    `select ls.*, f.id as fundi_record_id
     from liveness_sessions ls join fundis f on f.id = ls.fundi_id
     where ls.id = $1 and ls.user_id = $2 and ls.expires_at > now()`,
    [sessionId, userId],
  );
  const row = session.rows[0];
  if (!row) throw Object.assign(new Error('Session not found'), { status: 404 });

  const frames = row.frames || [];
  const antiSpoofFlags = await detectAntiSpoof(frames);
  const livenessScore = computeLivenessScore(frames, antiSpoofFlags);

  const idDoc = await query(
    `select r2_key from verification_documents where fundi_id = $1 and document_type = 'id_front' limit 1`,
    [row.fundi_id],
  );
  const holdStill = frames.find((f) => f.challengeId === 'hold_still') || frames[frames.length - 1];
  let faceMatchScore = Number(row.face_match_score || 0);

  if (idDoc.rows[0]?.r2_key && holdStill?.r2Key) {
    faceMatchScore = await compareIdAndSelfie(idDoc.rows[0].r2_key, holdStill.r2Key);
  }

  const duplicateFlags = antiSpoofFlags.map((f) => ({ type: f }));
  const fraudRiskScore = await computeFraudRisk({
    blurScore: 50,
    duplicateFlags,
    faceMatchScore,
    livenessScore,
  });

  const verificationResult = classifyVerificationResult(faceMatchScore, livenessScore, fraudRiskScore);

  await transaction(async (client) => {
    await client.query(
      `update liveness_sessions set status = 'completed', liveness_score = $2, face_match_score = $3,
        fraud_risk_score = $4, verification_result = $5, anti_spoof_flags = $6::jsonb, completed_at = now()
       where id = $1`,
      [sessionId, livenessScore, faceMatchScore, fraudRiskScore, verificationResult, JSON.stringify(antiSpoofFlags)],
    );

    if (holdStill?.r2Key) {
      await client.query(
        `insert into verification_documents (fundi_id, user_id, document_type, r2_key, mime_type, file_size, uploaded_by, status, face_match_score, verification_result, perceptual_hash)
         values ($1, $2, 'selfie_id', $3, 'image/webp', 0, $2, 'pending', $4, $5, $6)
         on conflict (fundi_id, document_type) do update set
           r2_key = excluded.r2_key, face_match_score = excluded.face_match_score,
           verification_result = excluded.verification_result, perceptual_hash = excluded.perceptual_hash, created_at = now()`,
        [row.fundi_id, userId, holdStill.r2Key, faceMatchScore, verificationResult, holdStill.perceptualHash],
      );
    }

    await client.query(
      `update fundis set liveness_score = $2, face_match_score = $3, fraud_risk_score = $4,
        verification_result = $5, verification_review_status = $6, updated_at = now() where id = $1`,
      [row.fundi_id, livenessScore, faceMatchScore, fraudRiskScore, verificationResult,
        verificationResult === 'auto_approved' ? 'strong_match' : verificationResult],
    );

    await client.query(
      `update users set liveness_score = $2, face_match_score = $3, fraud_risk_score = $4,
        verification_status = $5, updated_at = now() where id = $1`,
      [userId, livenessScore, faceMatchScore, fraudRiskScore,
        verificationResult === 'suspicious' ? 'review_required' : 'pending'],
    );
  });

  await auditLog({
    userId,
    action: 'liveness.completed',
    entityType: 'liveness_session',
    entityId: sessionId,
    metadata: { livenessScore, faceMatchScore, fraudRiskScore, verificationResult, antiSpoofFlags },
  });

  const autoResult = verificationResult === 'auto_approved'
    ? await tryAutoApprove(row.fundi_id, userId)
    : { autoApproved: false };

  return {
    success: true,
    livenessScore,
    faceMatchScore,
    fraudRiskScore,
    verificationResult,
    antiSpoofFlags,
    autoApproved: autoResult.autoApproved,
    status: autoResult.autoApproved ? 'verified' : verificationResult,
  };
}

export { CHALLENGES };
