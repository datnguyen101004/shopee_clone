-- Contract phase: all readers and writers now use typed CMS targets and
-- campaign-owned detail fields, so remove the legacy banner aggregate fields.
CREATE TEMP TABLE "_homepage_cms_contract_counts" AS
SELECT COUNT(*) AS banner_count FROM "homepage_banners";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'homepage_banners_campaign_id_fkey'
  ) THEN
    ALTER TABLE "homepage_banners"
      DROP CONSTRAINT "homepage_banners_campaign_id_fkey";
  END IF;
END $$;

DROP INDEX IF EXISTS "homepage_banners_campaign_id_key";

ALTER TABLE "homepage_banners"
  DROP COLUMN IF EXISTS "campaign_id",
  DROP COLUMN IF EXISTS "destination_path",
  DROP COLUMN IF EXISTS "content_json";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "homepage_banners"
    WHERE "target_type" IS NULL
       OR "target_type" NOT IN ('CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY', 'SEARCH', 'URL')
       OR ("target_type" IN ('CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY') AND "target_id" IS NULL)
       OR ("target_type" IN ('SEARCH', 'URL') AND ("target_id" IS NOT NULL OR "target_query" IS NULL OR btrim("target_query") = ''))
  ) THEN
    RAISE EXCEPTION 'homepage_banners contains an incomplete typed target';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "homepage_banners" b
    LEFT JOIN "marketplace_campaigns" c ON c."id" = b."target_id"
    WHERE b."target_type" = 'CAMPAIGN' AND c."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "homepage_banners" b
    LEFT JOIN "products" p ON p."id" = b."target_id"
    WHERE b."target_type" = 'PRODUCT' AND p."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "homepage_banners" b
    LEFT JOIN "shops" s ON s."id" = b."target_id"
    WHERE b."target_type" = 'SHOP' AND s."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "homepage_banners" b
    LEFT JOIN "categories" c ON c."id" = b."target_id"
    WHERE b."target_type" = 'CATEGORY' AND c."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'homepage_banners contains orphaned typed targets';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "homepage_banners"
    GROUP BY "module_id", "sort_order"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'homepage_banners contains ordering collisions';
  END IF;
  IF (SELECT COUNT(*) FROM "homepage_banners") <> (SELECT banner_count FROM "_homepage_cms_contract_counts") THEN
    RAISE EXCEPTION 'homepage CMS contract migration changed source row counts';
  END IF;
END $$;

ALTER TABLE "homepage_banners"
  ALTER COLUMN "target_type" SET NOT NULL;

ALTER TABLE "homepage_banners"
  ADD CONSTRAINT "homepage_banners_target_type_check"
  CHECK ("target_type" IN ('CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY', 'SEARCH', 'URL'));

ALTER TABLE "homepage_banners"
  ADD CONSTRAINT "homepage_banners_display_window_check"
  CHECK ("display_until" IS NULL OR "display_from" IS NULL OR "display_until" > "display_from");

ALTER TABLE "homepage_banners"
  ADD CONSTRAINT "homepage_banners_target_value_check"
  CHECK (
    ("target_type" IN ('CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY') AND "target_id" IS NOT NULL AND "target_query" IS NULL)
    OR ("target_type" IN ('SEARCH', 'URL') AND "target_id" IS NULL AND "target_query" IS NOT NULL AND btrim("target_query") <> '')
  );

DROP TABLE "_homepage_cms_contract_counts";
