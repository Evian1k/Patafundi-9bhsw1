-- Separate service availability from automatic pricing. Categories without an
-- active price-engine row require a provider quote; legacy numeric values are
-- retained for audit/history but are not exposed or used as a customer price.

ALTER TABLE country_service_categories
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'automatic';

ALTER TABLE country_service_categories
  ALTER COLUMN base_price DROP NOT NULL,
  ALTER COLUMN minimum_price DROP NOT NULL,
  ALTER COLUMN maximum_price DROP NOT NULL,
  ALTER COLUMN estimated_duration_minutes DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_service_categories_pricing_mode_check'
      AND conrelid = 'country_service_categories'::regclass
  ) THEN
    ALTER TABLE country_service_categories
      ADD CONSTRAINT country_service_categories_pricing_mode_check
      CHECK (pricing_mode IN ('automatic', 'quote_required'));
  END IF;
END $$;

-- Do not alter any monetary values. Only label missing/unsupported pricing
-- schedules accurately so clients never claim a calculable price exists.
UPDATE country_service_categories c
SET pricing_mode = 'quote_required', updated_at = now()
WHERE c.service_category = 'other'
   OR c.country_code <> 'KE'
   OR NOT EXISTS (
     SELECT 1 FROM service_pricing p
     WHERE p.service_category = c.service_category AND p.is_active = true
   );
