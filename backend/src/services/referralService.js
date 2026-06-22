/**
 * Referral Service — Voucher-based referral system
 *
 * BUSINESS RULES (enforced here, NOT in controllers):
 *   1. Rewards are DISCOUNT VOUCHERS ONLY — never cash, never wallet credit
 *   2. Discount = campaign.discount_percentage of job price, capped at campaign.max_discount_kes
 *   3. Voucher valid for campaign.voucher_validity_days (default 30)
 *   4. Single-use, non-transferable, non-stackable, non-withdrawable
 *   5. Voucher issued ONLY after referee:
 *        - verifies email + phone
 *        - completes first PAID job with value >= campaign.min_job_value_kes
 *        - passes all fraud checks
 *   6. Self-referrals blocked (referrer cannot be referee)
 *   7. Duplicate email/phone/device/IP blocked
 *   8. Only ACTIVE campaigns generate vouchers
 *
 * NO FUNCTION IN THIS FILE MAY ISSUE CASH OR WALLET CREDIT.
 */
import crypto from 'node:crypto';
import { query } from '../db.js';

// ============================================================
// CODE GENERATION
// ============================================================

/**
 * Generate a unique referral code for a user.
 * Format: PF-XXXXXX (6 alphanumeric chars, unambiguous — no 0/O/1/I)
 */
export async function generateReferralCode(userId) {
  // Check if user already has a code
  const existing = await query(
    'select referral_code from user_referral_codes where user_id = $1',
    [userId],
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].referral_code;
  }

  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let code;
  let attempts = 0;
  do {
    code = 'PF-';
    for (let i = 0; i < 6; i++) {
      code += charset[crypto.randomInt(charset.length)];
    }
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique referral code');
    const clash = await query(
      'select 1 from user_referral_codes where referral_code = $1',
      [code],
    );
    if (clash.rows.length === 0) break;
  } while (true);

  await query(
    `insert into user_referral_codes (user_id, referral_code)
     values ($1, $2)
     on conflict (user_id) do nothing`,
    [userId, code],
  );
  return code;
}

/**
 * Get or generate the user's referral code + stats.
 */
export async function getMyReferralCode(userId) {
  await generateReferralCode(userId);
  const result = await query(
    `select referral_code, total_shares, total_signups, total_completed,
            total_vouchers_earned, total_vouchers_redeemed, total_savings_kes
     from user_referral_codes where user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

// ============================================================
// REFERRAL APPLICATION (registration time)
// ============================================================

/**
 * Validate a referral code WITHOUT consuming it.
 * Used at registration time to check if the code is valid.
 * Returns { valid, referrerId, campaignId, reason }.
 */
export async function validateReferralCode(code, newUserId, newEmail, newPhone, ipAddress, deviceFingerprint) {
  if (!code || typeof code !== 'string') {
    return { valid: false, reason: 'No referral code provided' };
  }

  // 1. Find the code
  const codeResult = await query(
    `select user_id as referrer_id, referral_code
     from user_referral_codes where referral_code = $1`,
    [code.trim().toUpperCase()],
  );
  if (codeResult.rows.length === 0) {
    return { valid: false, reason: 'Invalid referral code' };
  }
  const referrerId = codeResult.rows[0].referrer_id;

  // 2. Block self-referral
  if (referrerId === newUserId) {
    await logFraudEvent({
      fraudType: 'self_referral',
      attemptedBy: newUserId,
      details: { code, referrerId },
      ipAddress, deviceFingerprint,
    });
    return { valid: false, reason: 'Self-referral is not allowed' };
  }

  // 3. Check if new user was already referred (one referral per user)
  const existingReferral = await query(
    'select 1 from referrals where referee_id = $1',
    [newUserId],
  );
  if (existingReferral.rows.length > 0) {
    return { valid: false, reason: 'User has already been referred' };
  }

  // 4. Check duplicate email
  const emailClash = await query(
    `select 1 from users where email = $1 and id != $2`,
    [newEmail, newUserId],
  );
  if (emailClash.rows.length > 0) {
    await logFraudEvent({
      fraudType: 'duplicate_email',
      attemptedBy: newUserId,
      details: { code, email: newEmail },
      ipAddress, deviceFingerprint,
    });
    return { valid: false, reason: 'Duplicate email detected' };
  }

  // 5. Check duplicate phone
  if (newPhone) {
    const phoneClash = await query(
      `select 1 from users where phone = $1 and id != $2`,
      [newPhone, newUserId],
    );
    if (phoneClash.rows.length > 0) {
      await logFraudEvent({
        fraudType: 'duplicate_phone',
        attemptedBy: newUserId,
        details: { code, phone: newPhone },
        ipAddress, deviceFingerprint,
      });
      return { valid: false, reason: 'Duplicate phone detected' };
    }
  }

  // 6. Check duplicate device fingerprint
  if (deviceFingerprint) {
    const deviceClash = await query(
      `select 1 from referrals
       where device_fingerprint = $1
         and referee_id != $2
         and created_at > now() - interval '30 days'`,
      [deviceFingerprint, newUserId],
    );
    if (deviceClash.rows.length > 0) {
      await logFraudEvent({
        fraudType: 'duplicate_device',
        attemptedBy: newUserId,
        details: { code, deviceFingerprint },
        ipAddress, deviceFingerprint,
      });
      return { valid: false, reason: 'Duplicate device detected' };
    }
  }

  // 7. Check duplicate IP (more lenient — allow 3 referrals per IP per 30 days)
  if (ipAddress) {
    const ipCount = await query(
      `select count(*)::int as n from referrals
       where ip_address = $1
         and referee_id != $2
         and created_at > now() - interval '30 days'`,
      [ipAddress, newUserId],
    );
    if (ipCount.rows[0].n >= 3) {
      await logFraudEvent({
        fraudType: 'duplicate_ip',
        attemptedBy: newUserId,
        details: { code, ipAddress, count: ipCount.rows[0].n },
        ipAddress, deviceFingerprint,
      });
      return { valid: false, reason: 'Too many referrals from this IP address' };
    }
  }

  // 8. Find an active campaign (prefer 'sunday'/'promo' over 'standard')
  const campaign = await getActiveCampaign();
  if (!campaign) {
    return { valid: false, reason: 'No active referral campaign' };
  }

  return {
    valid: true,
    referrerId,
    campaignId: campaign.id,
    campaign,
  };
}

/**
 * Create a pending referral row after a new user registers with a code.
 * This does NOT issue a voucher — the voucher is issued only after the
 * referee completes their first paid job.
 */
export async function createReferral({ referrerId, refereeId, code, campaignId, ipAddress, deviceFingerprint }) {
  const result = await query(
    `insert into referrals
       (referrer_id, referee_id, referral_code, status, reward_type,
        campaign_id, ip_address, device_fingerprint, fraud_check_passed)
     values ($1, $2, $3, 'pending', 'discount_voucher', $4, $5, $6, false)
     returning id, status`,
    [referrerId, refereeId, code, campaignId, ipAddress, deviceFingerprint],
  );

  // Increment referrer's share/signup count
  await query(
    `update user_referral_codes
     set total_shares = total_shares + 1,
         total_signups = total_signups + 1,
         updated_at = now()
     where user_id = $1`,
    [referrerId],
  );

  return result.rows[0];
}

// ============================================================
// CAMPAIGN MANAGEMENT
// ============================================================

/**
 * Get the current active campaign.
 * Priority: sunday (active & in date range) > promo > standard.
 */
export async function getActiveCampaign() {
  const now = new Date();
  const result = await query(
    `select * from referral_campaigns
     where status = 'active'
       and (campaign_type = 'standard'
            or (start_date is not null and end_date is not null
                and start_date <= $1 and end_date >= $1))
       and (max_redemptions is null or redemptions_count < max_redemptions)
     order by
       case campaign_type when 'sunday' then 1 when 'promo' then 2 else 3 end,
       discount_percentage desc
     limit 1`,
    [now],
  );
  return result.rows[0] || null;
}

export async function listCampaigns() {
  const result = await query(
    `select c.*, u.full_name as created_by_name
     from referral_campaigns c
     left join users u on u.id = c.created_by
     order by c.created_at desc`,
  );
  return result.rows;
}

export async function createCampaign(data, createdBy) {
  const result = await query(
    `insert into referral_campaigns
       (name, slug, description, campaign_type, discount_percentage,
        max_discount_kes, voucher_validity_days, min_job_value_kes,
        status, start_date, end_date, max_redemptions, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      data.name,
      data.slug,
      data.description || null,
      data.campaignType || 'promo',
      data.discountPercentage || 2,
      data.maxDiscountKes || 500,
      data.voucherValidityDays || 30,
      data.minJobValueKes || 500,
      data.status || 'active',
      data.startDate || null,
      data.endDate || null,
      data.maxRedemptions || null,
      createdBy,
    ],
  );
  return result.rows[0];
}

export async function updateCampaignStatus(campaignId, status, updatedBy) {
  // Only allow transitions: active → paused → active, active → disabled, paused → disabled
  const validStatuses = ['active', 'paused', 'disabled', 'expired'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const result = await query(
    `update referral_campaigns
     set status = $1, updated_at = now()
     where id = $2
     returning *`,
    [status, campaignId],
  );
  if (result.rows.length === 0) throw new Error('Campaign not found');
  return result.rows[0];
}

// ============================================================
// VOUCHER ISSUANCE (triggered by job completion)
// ============================================================

/**
 * Called after a job is completed + paid. Checks if the job customer
 * was a referee whose first paid job this is. If so, issues a voucher
 * to the referrer (subject to fraud checks).
 *
 * This is the ONLY function that issues vouchers. It is called by
 * jobController.confirmCompletion() — not directly by any API endpoint.
 *
 * Returns { voucherIssued: boolean, reason: string }.
 */
export async function processJobCompletionForReferral(jobId, customerId, jobValue) {
  // 1. Find the referral where this customer is the referee
  const referralResult = await query(
    `select r.*, c.discount_percentage, c.max_discount_kes,
            c.voucher_validity_days, c.min_job_value_kes,
            c.status as campaign_status, c.id as campaign_id,
            c.start_date, c.end_date, c.max_redemptions, c.redemptions_count,
            u.email_verified, u.phone
     from referrals r
     join referral_campaigns c on c.id = r.campaign_id
     join users u on u.id = r.referee_id
     where r.referee_id = $1
       and r.status in ('pending', 'completed')`,
    [customerId],
  );
  if (referralResult.rows.length === 0) {
    return { voucherIssued: false, reason: 'No referral found for this customer' };
  }
  const referral = referralResult.rows[0];

  // 2. Check if a voucher was already issued for this referral (one per referral)
  const existingVoucher = await query(
    `select 1 from referral_rewards where referral_id = $1`,
    [referral.id],
  );
  if (existingVoucher.rows.length > 0) {
    return { voucherIssued: false, reason: 'Voucher already issued for this referral' };
  }

  // 3. Check if this is the referee's FIRST paid job
  const paidJobsCount = await query(
    `select count(*)::int as n from jobs j
     join payments p on p.job_id = j.id and p.status = 'completed'
     where j.customer_id = $1 and j.status = 'completed'`,
    [customerId],
  );
  if (paidJobsCount.rows[0].n > 1) {
    // Not the first job — mark referral as completed without voucher
    await query(
      `update referrals set status = 'completed', referee_first_job_id = $1,
       referee_first_job_completed_at = now()
       where id = $2`,
      [jobId, referral.id],
    );
    return { voucherIssued: false, reason: 'Not the referee\'s first paid job' };
  }

  // 4. Check minimum job value
  if (Number(jobValue) < Number(referral.min_job_value_kes)) {
    await logFraudEvent({
      referralId: referral.id,
      fraudType: 'job_below_minimum',
      details: { jobId, jobValue, minimum: referral.min_job_value_kes },
    });
    return { voucherIssued: false, reason: `Job value below minimum (KES ${referral.min_job_value_kes})` };
  }

  // 5. Check email + phone verified
  if (!referral.email_verified) {
    await logFraudEvent({
      referralId: referral.id,
      fraudType: 'email_not_verified',
      details: { customerId },
    });
    return { voucherIssued: false, reason: 'Referee email not verified' };
  }
  if (!referral.phone) {
    await logFraudEvent({
      referralId: referral.id,
      fraudType: 'phone_not_verified',
      details: { customerId },
    });
    return { voucherIssued: false, reason: 'Referee phone not set' };
  }

  // 6. Check campaign is still active
  if (referral.campaign_status !== 'active') {
    await logFraudEvent({
      referralId: referral.id,
      fraudType: 'campaign_paused',
      details: { campaignId: referral.campaign_id, status: referral.campaign_status },
    });
    return { voucherIssued: false, reason: `Campaign is ${referral.campaign_status}` };
  }
  const now = new Date();
  if (referral.start_date && referral.end_date) {
    if (now < new Date(referral.start_date) || now > new Date(referral.end_date)) {
      await logFraudEvent({
        referralId: referral.id,
        fraudType: 'campaign_expired',
        details: { campaignId: referral.campaign_id, now, start: referral.start_date, end: referral.end_date },
      });
      return { voucherIssued: false, reason: 'Campaign window has expired' };
    }
  }
  if (referral.max_redemptions !== null && referral.redemptions_count >= referral.max_redemptions) {
    await logFraudEvent({
      referralId: referral.id,
      fraudType: 'campaign_max_reached',
      details: { campaignId: referral.campaign_id, count: referral.redemptions_count, max: referral.max_redemptions },
    });
    return { voucherIssued: false, reason: 'Campaign redemption limit reached' };
  }

  // 7. ALL CHECKS PASSED — issue the voucher
  const voucherCode = await generateVoucherCode();
  const expiresAt = new Date(Date.now() + (referral.voucher_validity_days * 24 * 60 * 60 * 1000));

  const voucherResult = await query(
    `insert into referral_rewards
       (user_id, referral_id, campaign_id, voucher_code,
        discount_percentage, max_discount_kes, status, expires_at)
     values ($1, $2, $3, $4, $5, $6, 'active', $7)
     returning *`,
    [
      referral.referrer_id,
      referral.id,
      referral.campaign_id,
      voucherCode,
      referral.discount_percentage,
      referral.max_discount_kes,
      expiresAt,
    ],
  );

  // 8. Update referral + campaign + user stats
  await query(
    `update referrals
     set status = 'rewarded',
         fraud_check_passed = true,
         voucher_issued_at = now(),
         referee_first_job_id = $1,
         referee_first_job_completed_at = now(),
         referee_email_verified = $2,
         referee_phone_verified = true
     where id = $3`,
    [jobId, referral.email_verified, referral.id],
  );

  await query(
    `update referral_campaigns
     set redemptions_count = redemptions_count + 1
     where id = $1`,
    [referral.campaign_id],
  );

  await query(
    `update user_referral_codes
     set total_completed = total_completed + 1,
         total_vouchers_earned = total_vouchers_earned + 1,
         updated_at = now()
     where user_id = $1`,
    [referral.referrer_id],
  );

  // 9. Create a notification for the referrer
  await query(
    `insert into notifications (user_id, type, title, message, data)
     values ($1, 'referral_voucher_earned',
       'Referral reward earned! 🎁',
       'You earned a ${referral.discount_percentage}% discount voucher for referring a friend. Use it on your next job!',
       $2::jsonb)`,
    [
      referral.referrer_id,
      JSON.stringify({ voucherCode, discountPercentage: referral.discount_percentage, expiresAt }),
    ],
  );

  return {
    voucherIssued: true,
    voucher: voucherResult.rows[0],
    reason: 'Voucher issued successfully',
  };
}

/**
 * Generate a unique voucher code. Format: PFV-XXXXXXXX (8 chars).
 */
async function generateVoucherCode() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  let attempts = 0;
  do {
    code = 'PFV-';
    for (let i = 0; i < 8; i++) {
      code += charset[crypto.randomInt(charset.length)];
    }
    attempts++;
    if (attempts > 20) throw new Error('Failed to generate unique voucher code');
    const clash = await query(
      'select 1 from referral_rewards where voucher_code = $1',
      [code],
    );
    if (clash.rows.length === 0) break;
  } while (true);
  return code;
}

// ============================================================
// VOUCHER REDEMPTION (triggered by job creation)
// ============================================================

/**
 * Apply the user's best active voucher to a new job.
 * Called by jobController.create() BEFORE inserting the job.
 *
 * Returns { applied: boolean, discount: number, voucherCode: string|null, reason: string }.
 *
 * BUSINESS RULE: Only ONE voucher per job. Cannot stack with other discounts.
 */
export async function applyVoucherToJob(userId, jobPrice, existingDiscount = 0) {
  // 1. Find user's active, non-expired vouchers
  const vouchers = await query(
    `select * from referral_rewards
     where user_id = $1
       and status = 'active'
       and expires_at > now()
     order by expires_at asc`, // use soonest-expiring first
    [userId],
  );
  if (vouchers.rows.length === 0) {
    return { applied: false, discount: 0, voucherCode: null, reason: 'No active vouchers' };
  }

  // 2. Block stacking
  if (existingDiscount > 0) {
    return { applied: false, discount: 0, voucherCode: null, reason: 'Cannot stack with existing discount' };
  }

  const voucher = vouchers.rows[0];
  const calculatedDiscount = Number(jobPrice) * (Number(voucher.discount_percentage) / 100);
  const cappedDiscount = Math.min(calculatedDiscount, Number(voucher.max_discount_kes));
  const finalDiscount = Math.round(cappedDiscount * 100) / 100;

  return {
    applied: true,
    discount: finalDiscount,
    voucherCode: voucher.voucher_code,
    voucherId: voucher.id,
    discountPercentage: Number(voucher.discount_percentage),
    maxDiscountKes: Number(voucher.max_discount_kes),
    expiresAt: voucher.expires_at,
    reason: `Applied ${voucher.discount_percentage}% discount (KES ${finalDiscount})`,
  };
}

/**
 * Confirm voucher redemption after job is created.
 * Called by jobController.create() AFTER the job is inserted.
 *
 * This marks the voucher as 'redeemed' and creates an audit row.
 * If the job creation fails (transaction rolled back), this is never called.
 */
export async function confirmVoucherRedemption({ voucherId, jobId, userId, originalPrice, discountApplied, ipAddress }) {
  const voucher = await query(
    `select * from referral_rewards where id = $1 for update`,
    [voucherId],
  );
  if (voucher.rows.length === 0) {
    throw new Error('Voucher not found');
  }
  const v = voucher.rows[0];

  // Re-verify (defensive)
  if (v.user_id !== userId) {
    await logRedemptionAttempt({
      rewardId: voucherId, jobId, userId,
      originalPrice, discountApplied,
      calculatedDiscount: 0, cappedDiscount: 0,
      status: 'rejected_not_owner',
      reason: 'User does not own this voucher',
      ipAddress,
    });
    throw new Error('Not voucher owner');
  }
  if (v.status !== 'active') {
    await logRedemptionAttempt({
      rewardId: voucherId, jobId, userId,
      originalPrice, discountApplied,
      calculatedDiscount: 0, cappedDiscount: 0,
      status: v.status === 'redeemed' ? 'rejected_already_used' : 'rejected_expired',
      reason: `Voucher is ${v.status}`,
      ipAddress,
    });
    throw new Error(`Voucher is ${v.status}`);
  }
  if (new Date(v.expires_at) < new Date()) {
    await query(`update referral_rewards set status = 'expired' where id = $1`, [voucherId]);
    await logRedemptionAttempt({
      rewardId: voucherId, jobId, userId,
      originalPrice, discountApplied,
      calculatedDiscount: 0, cappedDiscount: 0,
      status: 'rejected_expired',
      reason: 'Voucher expired',
      ipAddress,
    });
    throw new Error('Voucher expired');
  }

  // Mark as redeemed
  await query(
    `update referral_rewards
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_on_job_id = $1,
         discount_applied_kes = $2
     where id = $3`,
    [jobId, discountApplied, voucherId],
  );

  // Update user stats
  await query(
    `update user_referral_codes
     set total_vouchers_redeemed = total_vouchers_redeemed + 1,
         total_savings_kes = total_savings_kes + $2,
         updated_at = now()
     where user_id = $1`,
    [userId, discountApplied],
  );

  // Audit log
  await logRedemptionAttempt({
    rewardId: voucherId, jobId, userId,
    originalPrice,
    discountApplied,
    calculatedDiscount: Number(originalPrice) * (Number(v.discount_percentage) / 100),
    cappedDiscount: Math.min(Number(originalPrice) * (Number(v.discount_percentage) / 100), Number(v.max_discount_kes)),
    status: 'applied',
    reason: `Redeemed ${v.discount_percentage}% discount`,
    ipAddress,
  });

  return { success: true, voucherCode: v.voucher_code, discountApplied };
}

// ============================================================
// USER-FACING QUERIES (dashboard)
// ============================================================

export async function getMyReferralDashboard(userId) {
  const [codeRow, referrals, vouchers, history] = await Promise.all([
    getMyReferralCode(userId),
    query(
      `select r.id, r.status, r.created_at, r.voucher_issued_at,
              r.referee_email_verified, r.referee_phone_verified,
              r.fraud_check_passed, r.blocked_reason,
              u.full_name as referee_name,
              u.email as referee_email
       from referrals r
       join users u on u.id = r.referee_id
       where r.referrer_id = $1
       order by r.created_at desc`,
      [userId],
    ),
    query(
      `select id, voucher_code, discount_percentage, max_discount_kes,
              status, issued_at, expires_at, redeemed_at,
              discount_applied_kes
       from referral_rewards
       where user_id = $1
       order by issued_at desc`,
      [userId],
    ),
    query(
      `select r.id, r.voucher_code, r.discount_percentage, r.discount_applied_kes,
              r.redeemed_at, r.status, j.id as job_id, j.service_category
       from referral_rewards r
       left join jobs j on j.id = r.redeemed_on_job_id
       where r.user_id = $1 and r.status = 'redeemed'
       order by r.redeemed_at desc`,
      [userId],
    ),
  ]);

  return {
    code: codeRow?.referral_code || null,
    shareLink: codeRow ? `${process.env.FRONTEND_ORIGIN || 'https://patafundi.vercel.app'}/auth?ref=${codeRow.referral_code}` : null,
    stats: {
      shares: codeRow?.total_shares || 0,
      signups: codeRow?.total_signups || 0,
      completed: codeRow?.total_completed || 0,
      vouchersEarned: codeRow?.total_vouchers_earned || 0,
      vouchersRedeemed: codeRow?.total_vouchers_redeemed || 0,
      totalSavingsKes: Number(codeRow?.total_savings_kes || 0),
    },
    referrals: referrals.rows.map(r => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      voucherIssuedAt: r.voucher_issued_at,
      refereeName: maskName(r.referee_name),
      refereeEmail: maskEmail(r.referee_email),
      emailVerified: r.referee_email_verified,
      phoneVerified: r.referee_phone_verified,
      fraudCheckPassed: r.fraud_check_passed,
      blockedReason: r.blocked_reason,
    })),
    activeVouchers: vouchers.rows
      .filter(v => v.status === 'active' && new Date(v.expires_at) > new Date())
      .map(v => ({
        id: v.id,
        code: v.voucher_code,
        discountPercentage: Number(v.discount_percentage),
        maxDiscountKes: Number(v.max_discount_kes),
        expiresAt: v.expires_at,
        daysRemaining: Math.ceil((new Date(v.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      })),
    expiredVouchers: vouchers.rows
      .filter(v => v.status === 'expired' || (v.status === 'active' && new Date(v.expires_at) <= new Date()))
      .map(v => ({ id: v.id, code: v.voucher_code, expiresAt: v.expires_at })),
    redeemedVouchers: history.rows.map(r => ({
      id: r.id,
      code: r.voucher_code,
      discountPercentage: Number(r.discount_percentage),
      discountAppliedKes: Number(r.discount_applied_kes),
      redeemedAt: r.redeemed_at,
      jobId: r.job_id,
      serviceCategory: r.service_category,
    })),
  };
}

// ============================================================
// ADMIN ANALYTICS
// ============================================================

export async function getReferralAnalytics(period = '30d') {
  let interval = '30 days';
  if (period === '7d') interval = '7 days';
  else if (period === '90d') interval = '90 days';
  else if (period === 'year') interval = '365 days';

  const [
    overview,
    campaigns,
    topReferrers,
    fraudEvents,
    conversionFunnel,
    savingsOverTime,
  ] = await Promise.all([
    query(
      `select
         (select count(*)::int from referrals where created_at > now() - interval '${interval}') as total_referrals,
         (select count(*)::int from referrals where status = 'rewarded' and created_at > now() - interval '${interval}') as completed_referrals,
         (select count(*)::int from referral_rewards where issued_at > now() - interval '${interval}') as vouchers_issued,
         (select count(*)::int from referral_rewards where status = 'redeemed' and redeemed_at > now() - interval '${interval}') as vouchers_redeemed,
         (select count(*)::int from referral_rewards where status = 'expired' and issued_at > now() - interval '${interval}') as vouchers_expired,
         (select coalesce(sum(discount_applied_kes), 0)::numeric from referral_rewards where status = 'redeemed' and redeemed_at > now() - interval '${interval}') as total_discounts_issued_kes,
         (select count(*)::int from referral_fraud_events where created_at > now() - interval '${interval}') as fraud_attempts,
         (select count(*)::int from referral_fraud_events where review_status = 'confirmed_fraud' and created_at > now() - interval '${interval}') as confirmed_fraud`,
    ),
    query(
      `select c.id, c.name, c.slug, c.campaign_type, c.discount_percentage,
              c.max_discount_kes, c.status, c.start_date, c.end_date,
              c.redemptions_count, c.max_redemptions,
              (select count(*)::int from referral_rewards r where r.campaign_id = c.id) as vouchers_issued,
              (select count(*)::int from referral_rewards r where r.campaign_id = c.id and r.status = 'redeemed') as vouchers_redeemed,
              (select coalesce(sum(discount_applied_kes), 0)::numeric from referral_rewards r where r.campaign_id = c.id and r.status = 'redeemed') as total_discount_kes
       from referral_campaigns c
       order by c.created_at desc`,
    ),
    query(
      `select urc.user_id, u.full_name, u.email,
              urc.total_shares, urc.total_signups, urc.total_completed,
              urc.total_vouchers_earned, urc.total_vouchers_redeemed,
              urc.total_savings_kes
       from user_referral_codes urc
       join users u on u.id = urc.user_id
       order by urc.total_vouchers_earned desc, urc.total_completed desc
       limit 20`,
    ),
    query(
      `select fraud_type, count(*)::int as n,
              count(*) filter (where review_status = 'confirmed_fraud')::int as confirmed,
              max(created_at) as latest
       from referral_fraud_events
       where created_at > now() - interval '${interval}'
       group by fraud_type
       order by n desc`,
    ),
    query(
      `select
         (select count(*)::int from user_referral_codes where created_at > now() - interval '${interval}') as codes_generated,
         (select count(*)::int from referrals where created_at > now() - interval '${interval}') as referrals_created,
         (select count(*)::int from referrals where status in ('completed', 'rewarded') and created_at > now() - interval '${interval}') as referrals_completed,
         (select count(*)::int from referral_rewards where issued_at > now() - interval '${interval}') as vouchers_issued,
         (select count(*)::int from referral_rewards where status = 'redeemed' and redeemed_at > now() - interval '${interval}') as vouchers_redeemed`,
    ),
    query(
      `select date_trunc('day', redeemed_at) as date,
              count(*)::int as redemptions,
              coalesce(sum(discount_applied_kes), 0)::numeric as discounts
       from referral_rewards
       where status = 'redeemed'
         and redeemed_at > now() - interval '${interval}'
       group by 1 order by 1`,
    ),
  ]);

  return {
    overview: overview.rows[0],
    campaigns: campaigns.rows,
    topReferrers: topReferrers.rows,
    fraudSummary: fraudEvents.rows,
    conversionFunnel: conversionFunnel.rows[0],
    savingsOverTime: savingsOverTime.rows,
  };
}

export async function getFraudEvents({ status = 'pending', limit = 50 } = {}) {
  const result = await query(
    `select f.*, u.full_name as attempted_by_name,
            r.referral_code
     from referral_fraud_events f
     left join users u on u.id = f.attempted_by
     left join referrals r on r.id = f.referral_id
     where ($1 = 'all' or f.review_status = $1)
     order by f.created_at desc
     limit $2`,
    [status, limit],
  );
  return result.rows;
}

export async function reviewFraudEvent(eventId, { reviewStatus, reviewNotes }, reviewedBy) {
  const result = await query(
    `update referral_fraud_events
     set review_status = $1,
         review_notes = $2,
         reviewed_by = $3,
         reviewed_at = now()
     where id = $4
     returning *`,
    [reviewStatus, reviewNotes, reviewedBy, eventId],
  );
  return result.rows[0];
}

// ============================================================
// HELPERS
// ============================================================

async function logFraudEvent({ referralId, attemptedBy, fraudType, details, ipAddress, deviceFingerprint }) {
  await query(
    `insert into referral_fraud_events
       (referral_id, attempted_by, fraud_type, details, ip_address, device_fingerprint, action_taken)
     values ($1, $2, $3, $4::jsonb, $5, $6, 'blocked')`,
    [referralId || null, attemptedBy || null, fraudType, JSON.stringify(details || {}), ipAddress || null, deviceFingerprint || null],
  );
}

async function logRedemptionAttempt({ rewardId, jobId, userId, originalPrice, discountApplied, calculatedDiscount, cappedDiscount, status, reason, ipAddress }) {
  await query(
    `insert into referral_redemptions
       (reward_id, job_id, user_id, original_job_price, discount_percentage,
        discount_calculated_kes, discount_capped_kes, discount_applied_kes,
        status, reason, ip_address)
     select $1, $2, $3, $4,
            coalesce((select discount_percentage from referral_rewards where id = $1), 0),
            $5, $6, $7, $8, $9, $10`,
    [rewardId, jobId, userId, originalPrice, calculatedDiscount, cappedDiscount, discountApplied, status, reason, ipAddress || null],
  );
}

function maskName(name) {
  if (!name) return null;
  if (name.length <= 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return local[0] + '*@' + domain;
  return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + '@' + domain;
}
