-- Repair deployments where the originally recorded timezone migration was not applied to shops.
-- This migration is deliberately idempotent so it is safe on databases where the column exists.
ALTER TABLE "shops"
ADD COLUMN IF NOT EXISTS "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_time_zone_check'
      AND conrelid = 'shops'::regclass
  ) THEN
    ALTER TABLE "shops"
    ADD CONSTRAINT "shops_time_zone_check"
    CHECK (char_length("time_zone") BETWEEN 1 AND 64);
  END IF;
END
$$;
