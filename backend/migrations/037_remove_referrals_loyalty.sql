-- 037: Remove the Referral and Loyalty systems completely (product decision).
--
-- The platform no longer offers Refer & Earn or the Loyalty Program
-- (Bronze/Silver/Gold/Platinum/Diamond tiers, points, points history).
-- This migration drops every table the two systems owned, plus the orphaned
-- behavioral-risk column that tracked referral activity, and removes the
-- referral-specific permission keys so no role retains dead grants.
--
-- Safe to re-run: every statement is IF EXISTS.

-- ── 1. Referral tables (migrations 012 + 017) ─────────────────────────────
drop table if exists referral_fraud_events cascade;
drop table if exists referral_redemptions cascade;
drop table if exists referral_rewards cascade;
drop table if exists referral_campaigns cascade;
drop table if exists user_referral_codes cascade;
drop table if exists referrals cascade;

-- ── 2. Loyalty table (migration 012) ──────────────────────────────────────
drop table if exists user_loyalty cascade;

-- ── 3. Orphaned behavioral-risk column (created in migration 023) ─────────
alter table behavioral_risk_scores drop column if exists referral_activity_30d;

-- ── 4. Referral permission keys (seeded in migrations 017 + 018) ──────────
delete from role_permissions where permission_code in (
  'can_manage_referral_campaigns',
  'can_view_referral_analytics',
  'can_review_referral_fraud',
  'can_enable_disable_loyalty',
  'can_enable_disable_referrals',
  'can_view_loyalty_campaigns'
);
delete from user_permissions where permission_code in (
  'can_manage_referral_campaigns',
  'can_view_referral_analytics',
  'can_review_referral_fraud',
  'can_enable_disable_loyalty',
  'can_enable_disable_referrals',
  'can_view_loyalty_campaigns'
);
delete from permissions where code in (
  'can_manage_referral_campaigns',
  'can_view_referral_analytics',
  'can_review_referral_fraud',
  'can_enable_disable_loyalty',
  'can_enable_disable_referrals',
  'can_view_loyalty_campaigns'
);
