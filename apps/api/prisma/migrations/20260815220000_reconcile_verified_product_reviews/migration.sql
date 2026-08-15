-- Reconcile databases that applied the original T21 migration before the
-- verified-review schema was finalized. Fresh databases already have the
-- current shape from 20260815120000 and pass through this migration unchanged.

DO $$
BEGIN
  CREATE TYPE "review_visibility" AS ENUM ('visible', 'hidden');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "review_media_state" AS ENUM ('staged', 'attached');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The original implementation used product_reviews.buyer_id/rating_stars and
-- arbitrary URL media. Preserve it for audit/reference and rebuild the public
-- review table on the owner-bound staged-media model.
DO $$
DECLARE
  constraint_row record;
  index_row record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'buyer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'legacy_product_reviews'
  ) THEN
    ALTER TABLE "product_reviews" RENAME TO "legacy_product_reviews";

    -- PostgreSQL keeps constraint/index names when a table is renamed. Move
    -- those names out of the way before creating the finalized table.
    FOR constraint_row IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'legacy_product_reviews'::regclass AND conname LIKE 'product_reviews%'
    LOOP
      EXECUTE format(
        'ALTER TABLE "legacy_product_reviews" RENAME CONSTRAINT %I TO %I',
        constraint_row.conname,
        'legacy_' || constraint_row.conname
      );
    END LOOP;
    FOR index_row IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'legacy_product_reviews' AND indexname LIKE 'product_reviews%'
    LOOP
      EXECUTE format('ALTER INDEX %I RENAME TO %I', index_row.indexname, 'legacy_' || index_row.indexname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "rating_average_basis_points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rating_count" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_rating_summary_check') THEN
    ALTER TABLE "shops" ADD CONSTRAINT "shops_rating_summary_check"
      CHECK ("rating_average_basis_points" BETWEEN 0 AND 500 AND "rating_count" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_rating_summary_check') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_rating_summary_check"
      CHECK ("rating_average_basis_points" BETWEEN 0 AND 500 AND "rating_count" >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "product_reviews" (
  "id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "buyer_user_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "text" VARCHAR(1000),
  "visibility" "review_visibility" NOT NULL DEFAULT 'visible',
  "version" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "product_reviews_version_check" CHECK ("version" >= 0),
  CONSTRAINT "product_reviews_text_check" CHECK ("text" IS NULL OR (btrim("text") <> '' AND "text" !~ '[[:cntrl:]]')),
  CONSTRAINT "product_reviews_digest_check" CHECK ("request_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS "review_media" (
  "id" UUID NOT NULL,
  "uploader_id" UUID NOT NULL,
  "review_id" UUID,
  "storage_key" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(32) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "state" "review_media_state" NOT NULL DEFAULT 'staged',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_media_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 5242880),
  CONSTRAINT "review_media_dimensions_check" CHECK ("width" BETWEEN 1 AND 5000 AND "height" BETWEEN 1 AND 5000),
  CONSTRAINT "review_media_state_check" CHECK (("state" = 'staged' AND "review_id" IS NULL AND "expires_at" IS NOT NULL) OR ("state" = 'attached' AND "review_id" IS NOT NULL AND "expires_at" IS NULL)),
  CONSTRAINT "review_media_mime_check" CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE TABLE IF NOT EXISTS "review_moderation_events" (
  "id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "previous_visibility" "review_visibility" NOT NULL,
  "visibility" "review_visibility" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_moderation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_moderation_events_reason_check" CHECK (btrim("reason") <> '' AND "reason" !~ '[[:cntrl:]]')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legacy_product_reviews') THEN
    INSERT INTO "product_reviews" (
      "id", "order_line_id", "buyer_user_id", "product_id", "shop_id", "rating", "text", "visibility", "version", "idempotency_key", "request_digest", "created_at", "updated_at"
    )
    SELECT
      "id", "order_line_id", "buyer_id", "product_id", "shop_id", "rating_stars",
      CASE WHEN "body" IS NULL OR char_length(btrim("body")) > 1000 THEN NULL ELSE btrim("body") END,
      CASE WHEN "moderation_status"::text = 'hidden' THEN 'hidden'::"review_visibility" ELSE 'visible'::"review_visibility" END,
      "edit_count", "id", repeat(md5("id"::text), 2), "created_at", "updated_at"
    FROM "legacy_product_reviews"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "product_reviews_order_line_id_key" ON "product_reviews"("order_line_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_reviews_buyer_user_id_idempotency_key_key" ON "product_reviews"("buyer_user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "product_reviews_buyer_user_id_updated_at_id_idx" ON "product_reviews"("buyer_user_id", "updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "product_reviews_product_id_visibility_rating_updated_at_id_idx" ON "product_reviews"("product_id", "visibility", "rating", "updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "product_reviews_shop_id_visibility_updated_at_id_idx" ON "product_reviews"("shop_id", "visibility", "updated_at" DESC, "id" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "review_media_storage_key_key" ON "review_media"("storage_key");
CREATE UNIQUE INDEX IF NOT EXISTS "review_media_review_id_sort_order_key" ON "review_media"("review_id", "sort_order");
CREATE INDEX IF NOT EXISTS "review_media_uploader_id_state_expires_at_idx" ON "review_media"("uploader_id", "state", "expires_at");
CREATE INDEX IF NOT EXISTS "review_media_state_expires_at_idx" ON "review_media"("state", "expires_at");
CREATE INDEX IF NOT EXISTS "review_moderation_events_review_id_created_at_id_idx" ON "review_moderation_events"("review_id", "created_at", "id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_order_line_id_fkey') THEN
    ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_buyer_user_id_fkey') THEN
    ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_product_id_fkey') THEN
    ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_shop_id_fkey') THEN
    ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_media_uploader_id_fkey') THEN
    ALTER TABLE "review_media" ADD CONSTRAINT "review_media_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_media_review_id_fkey') THEN
    ALTER TABLE "review_media" ADD CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_moderation_events_review_id_fkey') THEN
    ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_moderation_events_actor_user_id_fkey') THEN
    ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "products" SET "rating_average_basis_points" = 0, "rating_count" = 0;
UPDATE "shops" SET "rating_average_basis_points" = 0, "rating_count" = 0;

UPDATE "products" AS product
SET
  "rating_count" = aggregate.count,
  "rating_average_basis_points" = aggregate.average
FROM (
  SELECT "product_id", count(*)::INTEGER AS count, round(avg("rating") * 100)::INTEGER AS average
  FROM "product_reviews"
  WHERE "visibility" = 'visible'
  GROUP BY "product_id"
) AS aggregate
WHERE product."id" = aggregate."product_id";

UPDATE "shops" AS shop
SET
  "rating_count" = aggregate.count,
  "rating_average_basis_points" = aggregate.average
FROM (
  SELECT "shop_id", count(*)::INTEGER AS count, round(avg("rating") * 100)::INTEGER AS average
  FROM "product_reviews"
  WHERE "visibility" = 'visible'
  GROUP BY "shop_id"
) AS aggregate
WHERE shop."id" = aggregate."shop_id";
