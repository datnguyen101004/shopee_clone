-- Backfill stable application media references without ever making S3 public.
-- The mapping is intentionally built from the linked asset/product-image relation;
-- URL hostname matching alone is not safe for imported or replaced galleries.
CREATE TEMP TABLE "private_product_media_url_map" ON COMMIT DROP AS
SELECT
  asset."id" AS "asset_id",
  image."id" AS "image_id",
  image."url" AS "legacy_url",
  ('/api/v1/product-media/' || asset."id"::text) AS "stable_url"
FROM "seller_product_media_assets" asset
INNER JOIN "product_images" image ON image."id" = asset."product_image_id"
WHERE asset."state" = 'attached'
  AND asset."product_image_id" IS NOT NULL;

CREATE TEMP TABLE "private_product_media_unique_url_map" ON COMMIT DROP AS
SELECT mapping.*
FROM "private_product_media_url_map" mapping
WHERE NOT EXISTS (
  SELECT 1
  FROM "private_product_media_url_map" duplicate
  WHERE duplicate."legacy_url" = mapping."legacy_url"
    AND duplicate."asset_id" <> mapping."asset_id"
);

UPDATE "order_lines" line
SET "product_image_url" = mapping."stable_url"
FROM "private_product_media_unique_url_map" mapping
WHERE line."product_image_url" = mapping."legacy_url"
  AND line."product_image_url" IS DISTINCT FROM mapping."stable_url";

UPDATE "notifications" notification
SET "metadata" = jsonb_set(notification."metadata", '{thumbnailUrl}', to_jsonb(mapping."stable_url"), false)
FROM "private_product_media_unique_url_map" mapping
WHERE notification."metadata"->>'thumbnailUrl' = mapping."legacy_url"
  AND notification."metadata"->>'thumbnailUrl' IS DISTINCT FROM mapping."stable_url";

UPDATE "product_images" image
SET "url" = mapping."stable_url"
FROM "private_product_media_url_map" mapping
WHERE image."id" = mapping."image_id"
  AND image."url" = mapping."legacy_url"
  AND image."url" IS DISTINCT FROM mapping."stable_url";

-- A linked asset must always resolve to its own stable route after this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "seller_product_media_assets" asset
    INNER JOIN "product_images" image ON image."id" = asset."product_image_id"
    WHERE asset."state" = 'attached'
      AND asset."product_image_id" IS NOT NULL
      AND image."url" <> ('/api/v1/product-media/' || asset."id"::text)
  ) THEN
    RAISE EXCEPTION 'private product media URL backfill left a linked asset unmapped';
  END IF;
END $$;
