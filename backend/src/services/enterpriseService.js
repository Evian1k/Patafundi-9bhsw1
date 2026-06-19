/**
 * Enterprise Services — quality scores, internal notes, referrals, loyalty, escalations, SLA, commission history.
 *
 * Each function is self-contained and uses the shared `query` from db.js.
 * All write operations are audit-logged via auditService.
 */
import { query } from '../db.js';
import { auditLog } from './auditService.js';
import { badRequest, notFound } from '../utils/http.js';

// ============================================================
// 1. FUNDI QUALITY SCORE (Phase 4)
// ============================================================
export async function calculateQualityScore(fundiId) {
  const stats = await query(
    `select
       count(*) filter (where j.status = 'completed')::int as completed,
       count(*) filter (where j.status = 'cancelled')::int as cancelled,
       count(*) filter (where j.status not in ('completed', 'cancelled', 'failed', 'pending', 'matching'))::int as accepted,
       count(*)::int as offered,
       coalesce(avg(r.rating), 0)::numeric(5,2) as avg_rating,
       coalesce(avg(extract(epoch from (jt_arrived.created_at - jt_accepted.created_at))/60), 0)::numeric(10,2) as avg_arrival_min,
       f.face_match_score, f.fraud_risk_score, f.verification_badge, f.trust_score,
       f.created_at
     from fundis f
     left join jobs j on j.fundi_id = f.user_id
     left join reviews r on r.job_id = j.id
     left join job_timeline jt_accepted on jt_accepted.job_id = j.id and jt_accepted.event_type = 'fundi_accepted'
     left join job_timeline jt_arrived on jt_arrived.job_id = j.id and jt_arrived.event_type = 'fundi_arrived'
     where f.id = $1
     group by f.id`,
    [fundiId],
  );

  const s = stats.rows[0] || {};
  const completed = Number(s.completed || 0);
  const cancelled = Number(s.cancelled || 0);
  const accepted = Number(s.accepted || 0);
  const offered = Number(s.offered || 1);
  const avgRating = Number(s.avg_rating || 0);

  // Calculate sub-scores (0-100)
  const ratingScore = Math.min(100, avgRating * 20);
  const completionScore = offered > 0 ? (completed / offered) * 100 : 0;
  const acceptanceScore = offered > 0 ? (accepted / offered) * 100 : 0;
  const cancellationScore = offered > 0 ? Math.max(0, 100 - (cancelled / offered) * 100) : 100;
  const punctualityScore = Math.min(100, Math.max(0, 100 - Number(s.avg_arrival_min || 0)));
  const verificationScore = Number(s.face_match_score || 0);
  const experienceScore = Math.min(100, completed * 5);
  const complaintScore = Math.max(0, 100 - cancelled * 10);

  // Weighted overall score
  const overallScore = Math.round(
    ratingScore * 0.20 +
    completionScore * 0.20 +
    acceptanceScore * 0.15 +
    cancellationScore * 0.10 +
    punctualityScore * 0.10 +
    verificationScore * 0.10 +
    experienceScore * 0.10 +
    complaintScore * 0.05
  );

  // Tier classification
  let tier = 'bronze';
  if (overallScore >= 90) tier = 'elite';
  else if (overallScore >= 75) tier = 'platinum';
  else if (overallScore >= 60) tier = 'gold';
  else if (overallScore >= 40) tier = 'silver';

  await query(
    `insert into fundi_quality_scores (fundi_id, rating_score, completion_score, acceptance_score,
       cancellation_score, punctuality_score, verification_score, experience_score, complaint_score,
       overall_score, tier, jobs_completed, jobs_cancelled, jobs_accepted, jobs_offered,
       avg_response_minutes, avg_arrival_minutes, last_calculated_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, null, $16, now(), now())
     on conflict (fundi_id) do update set
       rating_score = excluded.rating_score,
       completion_score = excluded.completion_score,
       acceptance_score = excluded.acceptance_score,
       cancellation_score = excluded.cancellation_score,
       punctuality_score = excluded.punctuality_score,
       verification_score = excluded.verification_score,
       experience_score = excluded.experience_score,
       complaint_score = excluded.complaint_score,
       overall_score = excluded.overall_score,
       tier = excluded.tier,
       jobs_completed = excluded.jobs_completed,
       jobs_cancelled = excluded.jobs_cancelled,
       jobs_accepted = excluded.jobs_accepted,
       jobs_offered = excluded.jobs_offered,
       avg_arrival_minutes = excluded.avg_arrival_minutes,
       last_calculated_at = now(),
       updated_at = now()`,
    [
      fundiId, ratingScore, completionScore, acceptanceScore,
      cancellationScore, punctualityScore, verificationScore, experienceScore, complaintScore,
      overallScore, tier, completed, cancelled, accepted, offered,
      Number(s.avg_arrival_min || 0),
    ],
  );

  return { overallScore, tier, subScores: { ratingScore, completionScore, acceptanceScore, cancellationScore, punctualityScore, verificationScore, experienceScore, complaintScore } };
}

export async function getQualityScore(fundiId) {
  const result = await query('select * from fundi_quality_scores where fundi_id = $1', [fundiId]);
  return result.rows[0] || null;
}

export async function recalculateAllQualityScores() {
  const fundis = await query('select id from fundis where approval_status = $1', ['approved']);
  let count = 0;
  for (const f of fundis.rows) {
    await calculateQualityScore(f.id);
    count++;
  }
  return count;
}

// ============================================================
// 2. INTERNAL NOTES (Phase 7)
// ============================================================
export async function createInternalNote({ entityType, entityId, authorId, note, isPinned = false }) {
  const validTypes = ['customer', 'fundi', 'job', 'payment', 'dispute', 'support_ticket'];
  if (!validTypes.includes(entityType)) throw badRequest(`Invalid entity type. Valid: ${validTypes.join(', ')}`);
  const result = await query(
    `insert into internal_notes (entity_type, entity_id, author_id, note, is_pinned)
     values ($1, $2, $3, $4, $5) returning *`,
    [entityType, entityId, authorId, note, isPinned],
  );
  await auditLog({ userId: authorId, action: 'note.create', entityType: entityType, entityId, metadata: { notePreview: note.slice(0, 80) } });
  return result.rows[0];
}

export async function listInternalNotes(entityType, entityId) {
  const result = await query(
    `select n.*, u.full_name as author_name, u.role as author_role
     from internal_notes n join users u on u.id = n.author_id
     where n.entity_type = $1 and n.entity_id = $2
     order by n.is_pinned desc, n.created_at desc`,
    [entityType, entityId],
  );
  return result.rows;
}

export async function deleteInternalNote(noteId, userId) {
  const result = await query('delete from internal_notes where id = $1 and author_id = $2 returning *', [noteId, userId]);
  if (!result.rows[0]) throw notFound('Note not found or not owned by you');
  await auditLog({ userId, action: 'note.delete', entityType: 'internal_note', entityId: noteId });
  return result.rows[0];
}

// ============================================================
// 3. REFERRAL SYSTEM (Phase 8)
// ============================================================
export async function generateReferralCode(userId) {
  const code = `PF-${userId.slice(0, 8).toUpperCase()}`;
  return code;
}

export async function createReferral({ referrerId, refereeId, rewardAmount = 100, rewardType = 'wallet_credit' }) {
  const code = await generateReferralCode(referrerId);
  const result = await query(
    `insert into referrals (referrer_id, referee_id, referral_code, status, reward_type, reward_amount)
     values ($1, $2, $3, 'pending', $4, $5)
     on conflict (referee_id) do nothing
     on conflict (referral_code) do nothing
     returning *`,
    [referrerId, refereeId, code, rewardType, rewardAmount],
  );
  return result.rows[0];
}

export async function completeReferral(refereeId) {
  const result = await query(
    `update referrals set status = 'completed', rewarded_at = now()
     where referee_id = $1 and status = 'pending' returning *`,
    [refereeId],
  );
  if (result.rows[0]) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'referral_completed', 'Referral Reward', 'You earned KES $2 for referring a new user!', $3::jsonb)`,
      [result.rows[0].referrer_id, result.rows[0].reward_amount, JSON.stringify({ refereeId, rewardAmount: result.rows[0].reward_amount })],
    );
  }
  return result.rows[0];
}

export async function getReferralStats(userId) {
  const result = await query(
    `select
       count(*)::int as total_referrals,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'rewarded')::int as rewarded,
       coalesce(sum(reward_amount) filter (where status in ('completed', 'rewarded')), 0)::numeric as total_earned
     from referrals where referrer_id = $1`,
    [userId],
  );
  return result.rows[0];
}

// ============================================================
// 4. LOYALTY SYSTEM (Phase 9)
// ============================================================
const LOYALTY_TIERS = {
  bronze: { minPoints: 0, minJobs: 0, minSpent: 0 },
  silver: { minPoints: 100, minJobs: 5, minSpent: 5000 },
  gold: { minPoints: 500, minJobs: 20, minSpent: 20000 },
  platinum: { minPoints: 1500, minJobs: 50, minSpent: 75000 },
  diamond: { minPoints: 5000, minJobs: 150, minSpent: 250000 },
};

export async function updateLoyaltyScore(userId) {
  const stats = await query(
    `select
       count(*) filter (where j.status = 'completed')::int as jobs_completed,
       coalesce(sum(p.amount), 0)::numeric as total_spent
     from jobs j
     left join payments p on p.job_id = j.id and p.status = 'completed'
     where j.customer_id = $1`,
    [userId],
  );

  const jobsCompleted = Number(stats.rows[0]?.jobs_completed || 0);
  const totalSpent = Number(stats.rows[0]?.total_spent || 0);
  const points = jobsCompleted * 10 + Math.floor(totalSpent / 100);

  let tier = 'bronze';
  for (const [t, req] of Object.entries(LOYALTY_TIERS).reverse()) {
    if (points >= req.minPoints && jobsCompleted >= req.minJobs && totalSpent >= req.minSpent) {
      tier = t;
      break;
    }
  }

  await query(
    `insert into user_loyalty (user_id, tier, points, jobs_completed, total_spent, tier_achieved_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (user_id) do update set
       tier = excluded.tier,
       points = excluded.points,
       jobs_completed = excluded.jobs_completed,
       total_spent = excluded.total_spent,
       tier_achieved_at = case when user_loyalty.tier <> excluded.tier then now() else user_loyalty.tier_achieved_at end,
       updated_at = now()`,
    [userId, tier, points, jobsCompleted, totalSpent],
  );

  return { tier, points, jobsCompleted, totalSpent };
}

export async function getLoyaltyScore(userId) {
  const result = await query('select * from user_loyalty where user_id = $1', [userId]);
  return result.rows[0] || { tier: 'bronze', points: 0, jobs_completed: 0, total_spent: 0 };
}

// ============================================================
// 5. ESCALATION SYSTEM (Phase 6)
// ============================================================
const ESCALATION_CHAIN = ['support_agent', 'admin', 'finance_team', 'fraud_analyst', 'super_admin'];

export async function createEscalation({ entityType, entityId, escalatedBy, fromRole, toRole, reason }) {
  const result = await query(
    `insert into escalations (entity_type, entity_id, escalated_by, escalated_to_role, from_role, reason)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [entityType, entityId, escalatedBy, toRole, fromRole, reason],
  );
  await auditLog({
    userId: escalatedBy,
    action: 'escalation.create',
    entityType,
    entityId,
    metadata: { fromRole, toRole, reason },
  });
  // Notify all users with the target role
  const targetUsers = await query('select id from users where role = $1 and status = $2', [toRole, 'active']);
  for (const u of targetUsers.rows) {
    await query(
      `insert into notifications (user_id, type, title, body, data)
       values ($1, 'escalation', 'New escalation', $2, $3::jsonb)`,
      [u.id, `${entityType} escalated from ${fromRole} to ${toRole}: ${reason}`, JSON.stringify({ entityType, entityId, escalationId: result.rows[0].id })],
    );
  }
  return result.rows[0];
}

export async function resolveEscalation(escalationId, resolvedBy, resolutionNote) {
  const result = await query(
    `update escalations set status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = $3, updated_at = now()
     where id = $1 returning *`,
    [escalationId, resolvedBy, resolutionNote],
  );
  if (!result.rows[0]) throw notFound('Escalation not found');
  await auditLog({ userId: resolvedBy, action: 'escalation.resolve', entityType: 'escalation', entityId: escalationId, metadata: { resolutionNote } });
  return result.rows[0];
}

export async function listEscalations({ status, role }) {
  const params = [];
  const filters = [];
  if (status) { params.push(status); filters.push(`status = $${params.length}`); }
  if (role) { params.push(role); filters.push(`escalated_to_role = $${params.length}`); }
  const where = filters.length ? `where ${filters.join(' and ')}` : '';
  const result = await query(
    `select e.*, u.full_name as escalated_by_name
     from escalations e join users u on u.id = e.escalated_by
     ${where} order by e.created_at desc limit 100`,
    params,
  );
  return result.rows;
}

// ============================================================
// 6. SLA MANAGEMENT (Phase 6)
// ============================================================
const SLA_TARGETS = {
  critical: { response: 15, resolution: 60 },   // 15 min / 1 hr
  high: { response: 60, resolution: 360 },       // 1 hr / 6 hr
  medium: { response: 360, resolution: 1440 },   // 6 hr / 24 hr
  low: { response: 1440, resolution: 2880 },     // 24 hr / 48 hr
};

export async function createSlaTrack({ entityType, entityId, priority = 'medium' }) {
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.medium;
  const result = await query(
    `insert into sla_tracks (entity_type, entity_id, priority, target_response_minutes, target_resolution_minutes)
     values ($1, $2, $3, $4, $5)
     on conflict do nothing
     returning *`,
    [entityType, entityId, priority, targets.response, targets.resolution],
  );
  return result.rows[0];
}

export async function recordFirstResponse(entityType, entityId) {
  await query(
    `update sla_tracks set first_response_at = now(),
      response_breached = case
        when first_response_at is null and extract(epoch from (now() - created_at))/60 > target_response_minutes then true
        else false
      end
     where entity_type = $1 and entity_id = $2 and first_response_at is null`,
    [entityType, entityId],
  );
}

export async function resolveSla(entityType, entityId) {
  await query(
    `update sla_tracks set resolved_at = now(),
      resolution_breached = case
        when extract(epoch from (now() - created_at))/60 > target_resolution_minutes then true
        else false
      end
     where entity_type = $1 and entity_id = $2`,
    [entityType, entityId],
  );
}

export async function getSlaBreaches() {
  const result = await query(
    `select * from sla_tracks
     where (response_breached = true or resolution_breached = true)
       and resolved_at is null
     order by created_at asc`,
  );
  return result.rows;
}

// ============================================================
// 7. COMMISSION HISTORY (Phase 3)
// ============================================================
export async function recordCommissionChange({ changedBy, scope, scopeValue, oldRate, newRate, oldType, newType, reason }) {
  const result = await query(
    `insert into commission_history (changed_by, scope, scope_value, old_rate, new_rate, old_type, new_type, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [changedBy, scope, scopeValue || null, oldRate, newRate, oldType || null, newType || null, reason || null],
  );
  await auditLog({ userId: changedBy, action: 'commission.change', entityType: 'platform_settings', entityId: null, metadata: { scope, scopeValue, oldRate, newRate, reason } });
  return result.rows[0];
}

export async function getCommissionHistory(scope, scopeValue) {
  const params = [];
  const filters = [];
  if (scope) { params.push(scope); filters.push(`scope = $${params.length}`); }
  if (scopeValue) { params.push(scopeValue); filters.push(`scope_value = $${params.length}`); }
  const where = filters.length ? `where ${filters.join(' and ')}` : '';
  const result = await query(
    `select ch.*, u.full_name as changed_by_name
     from commission_history ch join users u on u.id = ch.changed_by
     ${where} order by ch.created_at desc limit 100`,
    params,
  );
  return result.rows;
}
