-- Expand phase: add independent campaign detail ownership and typed CMS target
-- storage. The following contract migration removes the legacy banner fields
-- after this backfill has completed.
CREATE TEMP TABLE "_separate_homepage_cms_counts" AS
SELECT
  (SELECT COUNT(*) FROM "homepage_banners") AS banner_count,
  (SELECT COUNT(*) FROM "marketplace_campaigns") AS campaign_count;

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'banner_campaign_target_unavailable';

ALTER TABLE "marketplace_campaigns"
  ADD COLUMN IF NOT EXISTS "detail_eyebrow" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "detail_image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "detail_alt_text" VARCHAR(240),
  ADD COLUMN IF NOT EXISTS "detail_theme_key" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "detail_content_json" JSONB;

ALTER TABLE "homepage_banners"
  ALTER COLUMN "campaign_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "target_type" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "target_id" UUID,
  ADD COLUMN IF NOT EXISTS "target_query" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "display_from" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "display_until" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;

-- Copy campaign-owned presentation from the old banner aggregate before either
-- side can be created independently. Legacy columns remain as a fallback until
-- the contract phase.
UPDATE "marketplace_campaigns" AS c
SET
  "detail_eyebrow" = COALESCE(c."detail_eyebrow", b."eyebrow"),
  "detail_image_url" = COALESCE(c."detail_image_url", b."image_url"),
  "detail_alt_text" = COALESCE(c."detail_alt_text", b."alt_text"),
  "detail_theme_key" = COALESCE(c."detail_theme_key", b."theme_key"),
  "detail_content_json" = COALESCE(c."detail_content_json", b."content_json")
FROM "homepage_banners" AS b
WHERE b."campaign_id" = c."id"
  AND (
    c."detail_eyebrow" IS NULL
    OR c."detail_image_url" IS NULL
    OR c."detail_alt_text" IS NULL
    OR c."detail_theme_key" IS NULL
    OR c."detail_content_json" IS NULL
  );

-- Existing campaign banners keep their current visible window as closely as
-- possible. A campaign target can later become unavailable at read time, but
-- the migrated CMS row itself is not deleted.
UPDATE "homepage_banners" AS b
SET
  "target_type" = 'CAMPAIGN',
  "target_id" = b."campaign_id",
  "priority" = b."sort_order",
  "is_enabled" = true,
  "display_from" = c."announce_at",
  "display_until" = c."ends_at"
FROM "marketplace_campaigns" AS c
WHERE b."campaign_id" = c."id"
  AND b."target_type" IS NULL;

-- Defensive fallback for installations containing a banner without a campaign
-- despite the legacy foreign-key contract. It remains a CMS URL target.
UPDATE "homepage_banners"
SET
  "target_type" = 'URL',
  "target_query" = COALESCE(NULLIF(btrim("destination_path"), ''), '/'),
  "priority" = "sort_order"
WHERE "target_type" IS NULL;

CREATE INDEX IF NOT EXISTS "homepage_banners_module_enabled_window_priority_idx"
  ON "homepage_banners"("module_id", "is_enabled", "display_from", "display_until", "priority", "id");
CREATE INDEX IF NOT EXISTS "homepage_banners_target_lookup_idx"
  ON "homepage_banners"("target_type", "target_id");

DO $$
DECLARE
  expected_banners BIGINT;
  expected_campaigns BIGINT;
BEGIN
  SELECT banner_count, campaign_count
    INTO expected_banners, expected_campaigns
  FROM "_separate_homepage_cms_counts";
  IF (SELECT COUNT(*) FROM "homepage_banners") <> expected_banners
     OR (SELECT COUNT(*) FROM "marketplace_campaigns") <> expected_campaigns THEN
    RAISE EXCEPTION 'homepage CMS migration changed source row counts';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "marketplace_campaigns"
    WHERE "detail_content_json" IS NOT NULL
      AND (jsonb_typeof("detail_content_json") <> 'array' OR jsonb_array_length("detail_content_json") = 0)
  ) THEN
    RAISE EXCEPTION 'marketplace_campaigns contains malformed detail content';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "homepage_banners"
    GROUP BY "module_id", "sort_order"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'homepage_banners contains ordering collisions';
  END IF;
END $$;

DROP TABLE "_separate_homepage_cms_counts";
