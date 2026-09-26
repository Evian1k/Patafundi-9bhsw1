-- Migration 031: Fundi registration enhancements — KRA PIN, terms acceptance, profile photo
--
-- Adds missing fields to support complete fundi registration:
-- - KRA PIN (Kenya Revenue Authority)
-- - Business permit URL
-- - Terms acceptance tracking (version, timestamp, IP, device)
-- - Profile photo URL for customers

-- Fundi additional fields
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS business_permit_url text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS terms_accepted_ip text;
ALTER TABLE fundis ADD COLUMN IF NOT EXISTS terms_accepted_device text;

-- Customer profile photo
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- Refund tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES users(id);
