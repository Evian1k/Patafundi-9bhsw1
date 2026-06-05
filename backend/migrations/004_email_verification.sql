-- Email verification for OTP-based signup
alter table users add column if not exists email_verified_at timestamptz;

-- Existing accounts (seed/demo) are treated as already verified
update users set email_verified_at = coalesce(email_verified_at, created_at) where email_verified_at is null;
