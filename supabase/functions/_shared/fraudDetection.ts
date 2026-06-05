/**
 * Fraud Detection & Chat Content Filtering
 * Prevents platform bypass attempts through chat
 */

interface BypassDetectionResult {
  isBypass: boolean;
  type?: string;
  pattern?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ContentCheckResult {
  passed: boolean;
  violations: string[];
  score: number;  // 0-100, higher = more suspicious
}

/**
 * Detect bypass attempts in chat messages
 */
export function detectBypassAttempt(content: string): BypassDetectionResult {
  const patterns = {
    // Phone numbers (10-13 digits, with or without +254, 0)
    phoneNumber: /(?:\+?254|0)?\d{9,12}|(\d{3}[-.]?\d{3}[-.]?\d{4})/,
    
    // URLs and external services
    url: /https?:\/\/|www\.|\.com|\.co\.ke|bit\.ly|tinyurl/i,
    whatsapp: /wa\.me|whatsapp|signal|telegram|viber/i,
    email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    
    // Payment/money keywords
    mpesa: /\bm-pesa\b|\bmpesa\b|\bdaraja\b/i,
    paybill: /paybill|till|lipa/i,
    directPayment: /\bdirect pay\b|\bpay directly\b|\bskip.*app\b|\bskip.*platform\b/i,
    cashPayment: /\bcash\b|\bhard cash\b|\bhand.*cash\b|\bphysical.*money\b/i,
    
    // Off-platform coordination
    meetOutside: /\bmeet.*outside.*app\b|\blet's.*outside\b|\bargue.*later\b/i,
    offerOutside: /\boff.{0,3}platform\b|\bnot.*app\b|\bwithout.*app\b/i,
    
    // Generic payment requests through external means
    paymentLink: /send.*money|transfer.*money|mobile.*money|money.*transfer/i,
    
    // USSD codes
    ussd: /\*\d+\*|USSD|\*150\*|*100#/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(content)) {
      const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
        phoneNumber: 'high',
        url: 'high',
        whatsapp: 'critical',
        email: 'high',
        mpesa: 'critical',
        paybill: 'critical',
        directPayment: 'critical',
        cashPayment: 'high',
        meetOutside: 'medium',
        offerOutside: 'high',
        paymentLink: 'medium',
        ussd: 'critical',
      };

      return {
        isBypass: true,
        type,
        pattern: pattern.toString(),
        severity: severityMap[type] || 'medium',
      };
    }
  }

  return {
    isBypass: false,
    severity: 'low',
  };
}

/**
 * Comprehensive content safety check
 */
export function checkChatContent(
  content: string,
  metadata?: { senderRole?: string; jobId?: string }
): ContentCheckResult {
  const violations: string[] = [];
  let score = 0;

  const bypass = detectBypassAttempt(content);
  if (bypass.isBypass) {
    violations.push(`${bypass.type}: ${bypass.severity}`);
    score += bypass.severity === 'critical' ? 40 : bypass.severity === 'high' ? 25 : 10;
  }

  // Check for suspicious patterns
  if (content.length > 1000) {
    violations.push('Content too long');
    score += 5;
  }

  // Check for repeated suspicious keywords
  const suspiciousKeywords = ['urgent', 'quick', 'immediate', 'hurry', 'fast', 'asap'];
  const count = suspiciousKeywords.filter(keyword =>
    new RegExp(`\\b${keyword}\\b`, 'i').test(content)
  ).length;
  
  if (count >= 2) {
    violations.push(`Suspicious urgency (${count} keywords)`);
    score += 10;
  }

  return {
    passed: violations.length === 0,
    violations,
    score,
  };
}

/**
 * Log bypass attempt for fraud investigation
 */
export async function logBypassAttempt(
  db: any,  // Supabase client
  jobId: string,
  userId: string,
  userRole: string,
  content: string,
  detection: BypassDetectionResult
) {
  await db.from('fraud_alerts').insert({
    job_id: jobId,
    user_id: userId,
    user_role: userRole,
    alert_type: 'chat_bypass_attempt',
    detected_pattern: detection.type,
    severity: detection.severity,
    message_preview: content.substring(0, 200),
    created_at: new Date().toISOString(),
  });

  // If critical, notify admin immediately
  if (detection.severity === 'critical') {
    await db.from('admin_notifications').insert({
      type: 'critical_fraud_alert',
      title: 'Critical: Platform Bypass Attempt Detected',
      body: `User ${userId} (${userRole}) in job ${jobId} attempted: ${detection.type}`,
      data: { jobId, userId, detectionType: detection.type },
      created_at: new Date().toISOString(),
    });
  }
}

/**
 * Update user fraud score based on violations
 */
export async function updateFraudScore(
  db: any,
  userId: string,
  violation: 'bypass_attempt' | 'brute_force' | 'duplicate_payment' | 'dispute_loss',
  severity: 'low' | 'medium' | 'high' | 'critical'
) {
  const scoreDeduction: Record<string, Record<string, number>> = {
    bypass_attempt: { low: 5, medium: 10, high: 20, critical: 50 },
    brute_force: { low: 5, medium: 15, high: 30, critical: 100 },
    duplicate_payment: { low: 10, medium: 30, high: 50, critical: 100 },
    dispute_loss: { low: 5, medium: 15, high: 25, critical: 50 },
  };

  const deduction = scoreDeduction[violation]?.[severity] || 10;

  // Get current score
  const { data: profile } = await db
    .from('user_profiles')
    .select('trust_score')
    .eq('id', userId)
    .maybeSingle();

  const newScore = Math.max(0, (profile?.trust_score || 75) - deduction);

  // Update score
  await db.from('user_profiles').update({
    trust_score: newScore,
  }).eq('id', userId);

  // If score drops below 20, flag for review
  if (newScore < 20) {
    await db.from('admin_alerts').insert({
      user_id: userId,
      alert_type: 'low_trust_score',
      severity: 'high',
      message: `User ${userId} trust score dropped to ${newScore}. Consider suspension.`,
    });
  }

  return newScore;
}
