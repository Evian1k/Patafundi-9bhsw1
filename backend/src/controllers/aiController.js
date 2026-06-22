/**
 * AI Command Center Controller — super_admin only.
 *
 * All endpoints require super_admin role. The AI NEVER performs actions —
 * it only analyzes data and generates recommendations.
 */
import { query } from '../db.js';
import { runFullAnalysis } from '../services/aiService.js';
import { auditLog } from '../services/auditService.js';
import { badRequest, notFound } from '../utils/http.js';

/** GET /api/ai/dashboard — AI overview with recent recommendations */
export async function aiDashboard(_req, res) {
  const [pending, recent, byCategory, stats] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where severity = 'critical')::int as critical,
              count(*) filter (where severity = 'high')::int as high
       from ai_recommendations where status = 'pending'`,
    ),
    query(
      `select * from ai_recommendations
       order by created_at desc limit 20`,
    ),
    query(
      `select category, count(*)::int as count,
              count(*) filter (where status = 'pending')::int as pending
       from ai_recommendations
       group by category order by count desc`,
    ),
    query(
      `select count(*)::int as total,
              count(*) filter (where status = 'actioned')::int as actioned,
              count(*) filter (where status = 'dismissed')::int as dismissed,
              count(*) filter (where status = 'reviewed')::int as reviewed
       from ai_recommendations`,
    ),
  ]);

  res.json({
    success: true,
    dashboard: {
      pending: pending.rows[0],
      stats: stats.rows[0],
      byCategory: byCategory.rows,
      recent: recent.rows,
    },
  });
}

/** POST /api/ai/run — trigger full AI analysis (super_admin only) */
export async function runAnalysis(req, res) {
  const result = await runFullAnalysis();
  await auditLog({
    userId: req.user.id,
    action: 'ai.run_analysis',
    entityType: 'system',
    entityId: null,
    metadata: { totalRecommendations: result.totalRecommendations },
  });
  res.json({ success: true, result });
}

/** GET /api/ai/recommendations — list with filters */
export async function listRecommendations(req, res) {
  const category = req.query.category ? String(req.query.category) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const severity = req.query.severity ? String(req.query.severity) : null;

  const params = [];
  const filters = [];
  if (category) { params.push(category); filters.push(`category = $${params.length}`); }
  if (status) { params.push(status); filters.push(`status = $${params.length}`); }
  if (severity) { params.push(severity); filters.push(`severity = $${params.length}`); }

  const where = filters.length ? `where ${filters.join(' and ')}` : '';
  const result = await query(
    `select * from ai_recommendations ${where} order by created_at desc limit 100`,
    params,
  );
  res.json({ success: true, recommendations: result.rows });
}

/** POST /api/ai/recommendations/:id/review — mark as reviewed */
export async function reviewRecommendation(req, res) {
  const { action = 'reviewed', note = null } = req.body || {};
  // 'approve' = 'actioned' (super_admin agrees and will act)
  // 'reject' = 'dismissed' (super_admin disagrees)
  // 'reviewed' = noted but no decision yet
  const normalizedAction = action === 'approve' ? 'actioned' : action === 'reject' ? 'dismissed' : action;
  if (!['reviewed', 'dismissed', 'actioned'].includes(normalizedAction)) {
    throw badRequest('Invalid action. Use: approve, reject, reviewed, dismissed, or actioned');
  }
  const result = await query(
    `update ai_recommendations
     set status = $2, reviewed_by = $3, reviewed_at = now(), action_taken = $4
     where id = $1 returning *`,
    [req.params.id, normalizedAction, req.user.id, note],
  );
  if (!result.rows[0]) throw notFound('Recommendation not found');
  await auditLog({
    userId: req.user.id,
    action: `ai.review_${normalizedAction}`,
    entityType: 'ai_recommendation',
    entityId: req.params.id,
    metadata: { note, category: result.rows[0].category, originalAction: action },
  });
  res.json({ success: true, recommendation: result.rows[0] });
}

/** GET /api/ai/insights/:category — category-specific insights */
export async function getCategoryInsights(req, res) {
  const category = req.params.category;
  const validCategories = ['fundi_verification', 'fraud_detection', 'revenue', 'commission', 'platform_health', 'growth', 'staff_performance', 'customer_experience'];
  if (!validCategories.includes(category)) {
    throw badRequest(`Invalid category. Valid: ${validCategories.join(', ')}`);
  }

  const result = await query(
    `select * from ai_recommendations
     where category = $1
     order by created_at desc limit 50`,
    [category],
  );

  res.json({
    success: true,
    category,
    insights: result.rows,
    pending: result.rows.filter(r => r.status === 'pending').length,
  });
}
