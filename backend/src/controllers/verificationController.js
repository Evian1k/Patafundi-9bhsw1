import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import {
  startLivenessSession,
  uploadLivenessFrame,
  completeLivenessSession,
  CHALLENGES,
} from '../services/livenessVerificationService.js';
import { runIdentityVerification } from '../services/identityVerificationService.js';

export async function getLivenessChallenges(_req, res) {
  res.json({ success: true, challenges: CHALLENGES });
}

export async function startLiveness(req, res) {
  const fundi = await query('select id from fundis where user_id = $1', [req.user.id]);
  if (!fundi.rows[0]) throw notFound('Complete fundi registration first');
  const session = await startLivenessSession(req.user.id, fundi.rows[0].id);
  res.json({ success: true, ...session });
}

export async function submitLivenessFrame(req, res) {
  const { challengeId, clientConfidence } = req.body || {};
  const file = req.file || req.files?.[0];
  if (!challengeId || !file?.buffer) throw badRequest('Challenge ID and frame image required');

  const result = await uploadLivenessFrame(req.params.sessionId, req.user.id, {
    challengeId,
    frameBuffer: file.buffer,
    clientConfidence,
  });
  res.json({ success: true, ...result });
}

export async function finishLiveness(req, res) {
  const result = await completeLivenessSession(req.params.sessionId, req.user.id);
  res.json(result);
}

export async function runVerificationCheck(req, res) {
  const fundi = await query('select id from fundis where user_id = $1', [req.user.id]);
  if (!fundi.rows[0]) throw notFound('Fundi not found');
  const result = await runIdentityVerification(fundi.rows[0].id, req.user.id);
  res.json({ success: true, ...result });
}

export async function getVerificationStatus(req, res) {
  const result = await query(
    `select u.verification_status, u.face_match_score, u.liveness_score, u.fraud_risk_score, u.verified_at,
            f.verification_review_status, f.verification_result, f.approval_status
     from users u left join fundis f on f.user_id = u.id where u.id = $1`,
    [req.user.id],
  );
  res.json({ success: true, verification: result.rows[0] || null });
}
