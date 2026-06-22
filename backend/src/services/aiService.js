/**
 * AI Command Center Service — advisory only.
 *
 * CRITICAL SECURITY RULE: The AI NEVER performs actions.
 * It can only:
 *   - Analyze data
 *   - Generate recommendations
 *   - Create alerts
 *   - Log to ai_recommendations table
 *
 * The AI CANNOT:
 *   - Approve fundis
 *   - Reject fundis
 *   - Suspend users
 *   - Modify payments
 *   - Release escrow
 *   - Change commissions
 *   - Create staff
 *   - Delete anything
 *
 * All actions require super_admin approval via the existing admin endpoints.
 */

import { query } from '../db.js';
import { auditLog } from './auditService.js';

/** @typedef {Object} AIRecommendation
 * @property {string} category
 * @property {string} severity
 * @property {string} title
 * @property {string} description
 * @property {string} recommendation
 * @property {number} confidence
 * @property {Record<string, unknown>} [metadata]
 * @property {string} [affectedUserId]
 * @property {string} [affectedJobId]
 */

/**
 * Store a recommendation in the AI audit log.
 * This is the ONLY write operation the AI performs.
 * @param {AIRecommendation} rec
 */
async function logRecommendation(rec) {
  await query(
    `insert into ai_recommendations (category, severity, title, description, recommendation, confidence, metadata, affected_user_id, affected_job_id)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [
      rec.category,
      rec.severity,
      rec.title,
      rec.description,
      rec.recommendation,
      rec.confidence,
      JSON.stringify(rec.metadata || {}),
      rec.affectedUserId || null,
      rec.affectedJobId || null,
    ],
  );
}

// ============================================================
// 1. FUNDI VERIFICATION INSIGHTS
// ============================================================
export async function analyzeFundiVerifications() {
  const pending = await query(
    `select f.id, f.user_id, u.full_name, u.email, u.trust_score,
            f.face_match_score, f.fraud_risk_score, f.verification_result,
            f.created_at
     from fundis f join users u on u.id = f.user_id
     where f.approval_status = 'pending'
     order by f.created_at asc limit 50`,
  );

  const recommendations = [];

  for (const fundi of pending.rows) {
    const faceMatch = Number(fundi.face_match_score || 0);
    const fraudRisk = Number(fundi.fraud_risk_score || 0);
    const trustScore = Number(fundi.trust_score || 100);

    let confidence = 50;
    let action = 'Manual review required';
    let severity = 'medium';

    if (faceMatch >= 90 && fraudRisk <= 10 && trustScore >= 80) {
      confidence = 94;
      action = 'Recommend approval — strong face match, low fraud risk, high trust score';
      severity = 'low';
    } else if (faceMatch >= 75 && fraudRisk <= 25) {
      confidence = 78;
      action = 'Recommend approval pending document review — acceptable face match';
      severity = 'low';
    } else if (faceMatch < 60 || fraudRisk > 50) {
      confidence = 88;
      action = 'Recommend rejection — low face match or high fraud risk';
      severity = 'high';
    } else if (fraudRisk > 25) {
      confidence = 72;
      action = 'Recommend manual investigation — elevated fraud risk score';
      severity = 'medium';
    }

    recommendations.push({
      category: 'fundi_verification',
      severity,
      title: `Fundi verification: ${fundi.full_name}`,
      description: `Face match: ${faceMatch}%, Fraud risk: ${fraudRisk}%, Trust: ${trustScore}`,
      recommendation: action,
      confidence,
      metadata: { fundiId: fundi.id, faceMatch, fraudRisk, trustScore },
      affectedUserId: fundi.user_id,
    });
  }

  // Log all recommendations
  for (const rec of recommendations) {
    await logRecommendation(rec);
  }

  return { analyzed: pending.rows.length, recommendations };
}

// ============================================================
// 2. FRAUD DETECTION INSIGHTS
// ============================================================
export async function analyzeFraudPatterns() {
  const [highRisk, repeatOffenders, suspiciousPayments] = await Promise.all([
    query(
      `select user_id, fraud_score, risk_level, detection_count, last_detection_at
       from user_fraud_scores where fraud_score >= 51 order by fraud_score desc limit 20`,
    ),
    query(
      `select user_id, count(*)::int as alert_count
       from fraud_alerts where created_at > now() - interval '7 days' and resolved_at is null
       group by user_id having count(*) >= 3 order by alert_count desc limit 20`,
    ),
    query(
      `select j.id, j.fundi_id, j.customer_id, j.final_price, j.status, j.payment_status
       from expected_commissions ec
       join jobs j on j.id = ec.job_id
       where ec.flagged_suspicious = true
       order by ec.flagged_at desc limit 20`,
    ),
  ]);

  const recommendations = [];

  for (const user of highRisk.rows) {
    recommendations.push({
      category: 'fraud_detection',
      severity: 'critical',
      title: `High-risk user detected (score: ${user.fraud_score})`,
      description: `User ${user.user_id} has fraud score ${user.fraud_score} (${user.risk_level}) with ${user.detection_count} detections.`,
      recommendation: 'Recommend manual review and possible suspension by super_admin.',
      confidence: Math.min(95, Number(user.fraud_score)),
      metadata: { fraudScore: user.fraud_score, riskLevel: user.risk_level, detectionCount: user.detection_count },
      affectedUserId: user.user_id,
    });
  }

  for (const offender of repeatOffenders.rows) {
    recommendations.push({
      category: 'fraud_detection',
      severity: 'high',
      title: `Repeat fraud offender (${offender.alert_count} alerts in 7 days)`,
      description: `User ${offender.user_id} has triggered ${offender.alert_count} fraud alerts in the past 7 days.`,
      recommendation: 'Recommend investigation and possible suspension by super_admin.',
      confidence: 85,
      metadata: { alertCount: offender.alert_count },
      affectedUserId: offender.user_id,
    });
  }

  for (const job of suspiciousPayments.rows) {
    recommendations.push({
      category: 'fraud_detection',
      severity: 'high',
      title: `Suspicious payment: job ${job.id}`,
      description: `Job completed without platform payment — commission may be owed.`,
      recommendation: 'Recommend invoice creation and investigation by finance team.',
      confidence: 80,
      metadata: { jobId: job.id, fundiId: job.fundi_id, finalPrice: job.final_price },
      affectedJobId: job.id,
    });
  }

  for (const rec of recommendations) {
    await logRecommendation(rec);
  }

  return { analyzed: recommendations.length, recommendations };
}

// ============================================================
// 3. REVENUE INSIGHTS
// ============================================================
export async function analyzeRevenue() {
  const [today, week, month, byCategory] = await Promise.all([
    query(`select coalesce(sum(amount), 0)::numeric as total from revenue_ledger where entry_type = 'commission' and created_at > now() - interval '1 day'`),
    query(`select coalesce(sum(amount), 0)::numeric as total from revenue_ledger where entry_type = 'commission' and created_at > now() - interval '7 days'`),
    query(`select coalesce(sum(amount), 0)::numeric as total from revenue_ledger where entry_type = 'commission' and created_at > now() - interval '30 days'`),
    query(
      `select j.service_category, count(*)::int as jobs, coalesce(sum(rl.amount), 0)::numeric as revenue
       from revenue_ledger rl join jobs j on j.id = rl.job_id
       where rl.entry_type = 'commission' and rl.created_at > now() - interval '30 days'
       group by j.service_category order by revenue desc`,
    ),
  ]);

  const recommendations = [];

  const todayRevenue = Number(today.rows[0]?.total || 0);
  const weekRevenue = Number(week.rows[0]?.total || 0);
  const monthRevenue = Number(month.rows[0]?.total || 0);

  // Revenue drop detection
  if (weekRevenue > 0 && todayRevenue < weekRevenue / 14) {
    recommendations.push({
      category: 'revenue',
      severity: 'high',
      title: 'Revenue drop detected',
      description: `Today's revenue (KES ${todayRevenue.toFixed(0)}) is significantly below the weekly average (KES ${(weekRevenue / 7).toFixed(0)}).`,
      recommendation: 'Investigate potential causes: payment failures, reduced job creation, or fundi availability.',
      confidence: 75,
      metadata: { todayRevenue, weekRevenue, weekAverage: weekRevenue / 7 },
    });
  }

  // Category performance
  for (const cat of byCategory.rows) {
    if (Number(cat.jobs) < 3 && Number(cat.revenue) < 500) {
      recommendations.push({
        category: 'revenue',
        severity: 'medium',
        title: `Low-performing category: ${cat.service_category}`,
        description: `${cat.service_category} has only ${cat.jobs} jobs and KES ${cat.revenue} revenue in the last 30 days.`,
        recommendation: `Consider promotional discounts for ${cat.service_category} to boost demand, or review fundi availability in this category.`,
        confidence: 68,
        metadata: { category: cat.service_category, jobs: cat.jobs, revenue: cat.revenue },
      });
    }
  }

  for (const rec of recommendations) {
    await logRecommendation(rec);
  }

  return {
    todayRevenue, weekRevenue, monthRevenue,
    categoryBreakdown: byCategory.rows,
    recommendations,
  };
}

// ============================================================
// 4. COMMISSION INSIGHTS
// ============================================================
export async function analyzeCommissionRates() {
  const categories = await query(
    `select j.service_category,
            count(*)::int as jobs,
            coalesce(sum(ec.expected_commission), 0)::numeric as expected,
            coalesce(sum(rl.amount), 0)::numeric as collected,
            avg(ec.commission_rate)::numeric as avg_rate
     from expected_commissions ec
     join jobs j on j.id = ec.job_id
     left join revenue_ledger rl on rl.job_id = j.id and rl.entry_type = 'commission'
     where ec.created_at > now() - interval '30 days'
     group by j.service_category
     order by expected desc`,
  );

  const recommendations = [];

  for (const cat of categories.rows) {
    const expected = Number(cat.expected || 0);
    const collected = Number(cat.collected || 0);
    const collectionRate = expected > 0 ? (collected / expected) * 100 : 100;
    const avgRate = Number(cat.avg_rate || 0.15) * 100;

    if (collectionRate < 70 && expected > 1000) {
      recommendations.push({
        category: 'commission',
        severity: 'high',
        title: `Commission collection gap: ${cat.service_category}`,
        description: `${cat.service_category}: expected KES ${expected.toFixed(0)}, collected KES ${collected.toFixed(0)} (${collectionRate.toFixed(0)}% collection rate) at ${avgRate.toFixed(1)}% commission.`,
        recommendation: `Consider reducing commission from ${avgRate.toFixed(0)}% to ${(avgRate * 0.8).toFixed(0)}% to improve compliance, OR increase enforcement of off-platform payment detection.`,
        confidence: 72,
        metadata: { category: cat.service_category, expected, collected, collectionRate, avgRate },
      });
    }
  }

  for (const rec of recommendations) {
    await logRecommendation(rec);
  }

  return { categories: categories.rows, recommendations };
}

// ============================================================
// 5. PLATFORM HEALTH INSIGHTS
// ============================================================
export async function analyzePlatformHealth() {
  const [users, fundis, jobs, disputes, fraudAlerts, pendingPayouts] = await Promise.all([
    query(`select count(*)::int as total, count(*) filter (where status = 'active')::int as active, count(*) filter (where created_at > now() - interval '7 days')::int as new from users`),
    query(`select count(*)::int as total, count(*) filter (where approval_status = 'approved')::int as approved, count(*) filter (where approval_status = 'pending')::int as pending, count(*) filter (where online = true and approval_status = 'approved')::int as online from fundis`),
    query(`select count(*)::int as total, count(*) filter (where status = 'completed')::int as completed, count(*) filter (where status not in ('completed', 'cancelled', 'failed'))::int as active from jobs`),
    query(`select count(*)::int as total, count(*) filter (where status = 'open')::int as open from disputes`),
    query(`select count(*)::int as total, count(*) filter (where resolved_at is null)::int as open, count(*) filter (where severity = 'critical' and resolved_at is null)::int as critical_open from fraud_alerts`),
    query(`select count(*)::int as total, coalesce(sum(amount), 0)::numeric as amount from payouts where status in ('requested', 'processing')`),
  ]);

  const recommendations = [];

  // Pending fundi backlog
  const pendingFundis = Number(fundis.rows[0]?.pending || 0);
  if (pendingFundis > 10) {
    recommendations.push({
      category: 'platform_health',
      severity: 'medium',
      title: `${pendingFundis} fundis pending approval`,
      description: `There are ${pendingFundis} fundi applications awaiting review. This may cause fundis to lose interest.`,
      recommendation: 'Recommend prioritizing fundi verification to reduce onboarding friction.',
      confidence: 80,
      metadata: { pendingFundis },
    });
  }

  // Open disputes
  const openDisputes = Number(disputes.rows[0]?.open || 0);
  if (openDisputes > 5) {
    recommendations.push({
      category: 'platform_health',
      severity: 'high',
      title: `${openDisputes} open disputes`,
      description: `There are ${openDisputes} unresolved disputes. Prolonged disputes hurt customer trust.`,
      recommendation: 'Recommend assigning support agents to resolve disputes within SLA targets.',
      confidence: 82,
      metadata: { openDisputes },
    });
  }

  // Critical fraud alerts
  const criticalFraud = Number(fraudAlerts.rows[0]?.critical_open || 0);
  if (criticalFraud > 0) {
    recommendations.push({
      category: 'platform_health',
      severity: 'critical',
      title: `${criticalFraud} critical fraud alerts unresolved`,
      description: `There are ${criticalFraud} critical-severity fraud alerts that need immediate attention.`,
      recommendation: 'Recommend immediate review by fraud analyst or super_admin.',
      confidence: 95,
      metadata: { criticalFraud },
    });
  }

  for (const rec of recommendations) {
    await logRecommendation(rec);
  }

  return {
    users: users.rows[0],
    fundis: fundis.rows[0],
    jobs: jobs.rows[0],
    disputes: disputes.rows[0],
    fraudAlerts: fraudAlerts.rows[0],
    pendingPayouts: { count: Number(pendingPayouts.rows[0]?.total || 0), amount: Number(pendingPayouts.rows[0]?.amount || 0) },
    recommendations,
  };
}

// ============================================================
// 6. RUN full AI analysis (called by the API endpoint)
// ============================================================
export async function runFullAnalysis() {
  const [verification, fraud, revenue, commission, health] = await Promise.all([
    analyzeFundiVerifications(),
    analyzeFraudPatterns(),
    analyzeRevenue(),
    analyzeCommissionRates(),
    analyzePlatformHealth(),
  ]);

  await auditLog({
    action: 'ai.full_analysis_run',
    entityType: 'system',
    entityId: null,
    metadata: {
      verification: verification.recommendations.length,
      fraud: fraud.recommendations.length,
      revenue: revenue.recommendations.length,
      commission: commission.recommendations.length,
      health: health.recommendations.length,
    },
  });

  return {
    timestamp: new Date().toISOString(),
    verification,
    fraud,
    revenue,
    commission,
    health,
    totalRecommendations:
      verification.recommendations.length +
      fraud.recommendations.length +
      revenue.recommendations.length +
      commission.recommendations.length +
      health.recommendations.length,
  };
}
