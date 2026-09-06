CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE "marketplace_campaign_importance_class" AS ENUM ('normal', 'featured');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "marketplace_campaign_participation_state" AS ENUM ('unresponded', 'joined', 'declined', 'withdrawn', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "marketplace_campaign_reservation_source" AS ENUM ('shop_campaign', 'marketplace_campaign');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'campaign_announced';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'campaign_enrollment_reminder';

CREATE TABLE "marketplace_campaign_types" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "policy_key" VARCHAR(80) NOT NULL,
  "policy_version" INTEGER NOT NULL DEFAULT 1,
  "policy_config" JSONB NOT NULL DEFAULT '{}',
  "presentation_key" VARCHAR(80) NOT NULL,
  "product_order_key" VARCHAR(80) NOT NULL,
  "importance_class" "marketplace_campaign_importance_class" NOT NULL DEFAULT 'normal',
  "ranking_profile_key" VARCHAR(80) NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_campaign_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_campaign_types_code_key" ON "marketplace_campaign_types"("code");
CREATE INDEX "marketplace_campaign_types_enabled_code_idx" ON "marketplace_campaign_types"("is_enabled", "code");

INSERT INTO "marketplace_campaign_types" (
  "id", "code", "display_name", "description", "policy_key", "policy_version",
  "policy_config", "presentation_key", "product_order_key", "importance_class", "ranking_profile_key"
) VALUES
  ('00000000-0000-4000-8000-000000000801', 'STANDARD', 'Chiến dịch tiêu chuẩn', 'Ưu đãi theo danh mục hoặc chủ đề do sàn điều phối.', 'STANDARD_V1', 1, '{"minimumDiscountBasisPoints":500,"maximumProductsPerSeller":50}', 'STANDARD', 'CURATED', 'normal', 'NORMAL_V1'),
  ('00000000-0000-4000-8000-000000000802', 'FLASH_SALE', 'Flash Sale', 'Khung giờ giảm sâu, hiển thị nổi bật trên trang chủ.', 'FLASH_SALE_V1', 1, '{"minimumDiscountBasisPoints":1000,"maximumProductsPerSeller":20}', 'FLASH_SALE', 'DISCOUNT_DESC', 'featured', 'FEATURED_FLASH_SALE_V1'),
  ('00000000-0000-4000-8000-000000000803', 'CHEAPEST_DEALS', 'Rẻ Vô Địch', 'Tập hợp sản phẩm có mức giá cạnh tranh nhất.', 'CHEAPEST_DEALS_V1', 1, '{"minimumDiscountBasisPoints":300,"maximumProductsPerSeller":30}', 'CHEAPEST_DEALS', 'PRICE_ASC', 'normal', 'NORMAL_V1')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE "marketplace_campaigns" (
  "id" UUID NOT NULL,
  "type_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(500),
  "announce_at" TIMESTAMPTZ(3) NOT NULL,
  "enrollment_starts_at" TIMESTAMPTZ(3) NOT NULL,
  "enrollment_ends_at" TIMESTAMPTZ(3) NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "minimum_discount_basis_points" INTEGER NOT NULL,
  "policy_version_snapshot" INTEGER,
  "importance_class_snapshot" "marketplace_campaign_importance_class",
  "presentation_key_snapshot" VARCHAR(80),
  "product_order_key_snapshot" VARCHAR(80),
  "ranking_profile_key_snapshot" VARCHAR(80),
  "version" INTEGER NOT NULL DEFAULT 1,
  "published_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancellation_reason" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_campaigns_timeline_check" CHECK ("announce_at" <= "enrollment_starts_at" AND "enrollment_starts_at" < "enrollment_ends_at" AND "enrollment_ends_at" <= "starts_at" AND "starts_at" < "ends_at"),
  CONSTRAINT "marketplace_campaigns_discount_check" CHECK ("minimum_discount_basis_points" >= 1 AND "minimum_discount_basis_points" <= 9000),
  CONSTRAINT "marketplace_campaigns_type_fkey" FOREIGN KEY ("type_id") REFERENCES "marketplace_campaign_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "marketplace_campaigns_type_publish_window_idx" ON "marketplace_campaigns"("type_id", "published_at", "starts_at", "ends_at");
CREATE INDEX "marketplace_campaigns_publish_announcement_idx" ON "marketplace_campaigns"("published_at", "announce_at", "enrollment_ends_at");
CREATE INDEX "marketplace_campaigns_cancelled_idx" ON "marketplace_campaigns"("cancelled_at");

ALTER TABLE "homepage_banners" ADD COLUMN "campaign_id" UUID;
ALTER TABLE "homepage_banners" ADD COLUMN "content_json" JSONB;
CREATE UNIQUE INDEX "homepage_banners_campaign_id_key" ON "homepage_banners"("campaign_id");
ALTER TABLE "homepage_banners" ADD CONSTRAINT "homepage_banners_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_lines" ADD COLUMN "campaign_price_snapshot" JSONB;

-- Existing banner rows are converted into unpublished STANDARD drafts. The
-- generated content is deliberately plain text so legacy HTML cannot become a
-- trusted campaign block. Admins can review and publish each draft later.
DO $$
DECLARE
  banner_row RECORD;
  generated_campaign_id UUID;
  timeline_base TIMESTAMPTZ(3) := CURRENT_TIMESTAMP;
BEGIN
  FOR banner_row IN
    SELECT b."id", b."title", b."description"
      FROM "homepage_banners" b
     WHERE b."campaign_id" IS NULL
  LOOP
    generated_campaign_id := gen_random_uuid();
    INSERT INTO "marketplace_campaigns" (
      "id", "type_id", "name", "description", "announce_at",
      "enrollment_starts_at", "enrollment_ends_at", "starts_at", "ends_at",
      "minimum_discount_basis_points"
    ) VALUES (
      generated_campaign_id,
      '00000000-0000-4000-8000-000000000801',
      left(coalesce(nullif(btrim(banner_row."title"), ''), 'Chiến dịch tiêu chuẩn'), 160),
      left(banner_row."description", 500),
      timeline_base,
      timeline_base + interval '1 minute',
      timeline_base + interval '2 minutes',
      timeline_base + interval '3 minutes',
      timeline_base + interval '4 minutes',
      500
    );
    UPDATE "homepage_banners"
       SET "campaign_id" = generated_campaign_id,
           "destination_path" = '/banner/' || banner_row."id",
           "content_json" = jsonb_build_array(
             jsonb_build_object(
               'kind', 'paragraph',
               'text', left(regexp_replace(coalesce(banner_row."description", banner_row."title", ''), '[[:cntrl:]]', '', 'g'), 2000)
             )
           )
     WHERE "id" = banner_row."id";
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM "homepage_banners"
     WHERE "campaign_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Marketplace campaign migration stopped: one or more homepage banners were not backfilled.';
  END IF;
END $$;

-- Every banner is now owned by exactly one campaign. The backfill above is
-- intentionally completed before tightening this column so the upgrade is
-- safe for existing installations and fails loudly if coverage is incomplete.
ALTER TABLE "homepage_banners" ALTER COLUMN "campaign_id" SET NOT NULL;

CREATE TABLE "marketplace_campaign_categories" (
  "campaign_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  CONSTRAINT "marketplace_campaign_categories_pkey" PRIMARY KEY ("campaign_id", "category_id"),
  CONSTRAINT "marketplace_campaign_categories_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "marketplace_campaign_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "marketplace_campaign_categories_category_campaign_idx" ON "marketplace_campaign_categories"("category_id", "campaign_id");

CREATE TABLE "seller_campaign_participations" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "state" "marketplace_campaign_participation_state" NOT NULL DEFAULT 'unresponded',
  "version" INTEGER NOT NULL DEFAULT 1,
  "responded_at" TIMESTAMPTZ(3),
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_campaign_participations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_campaign_participations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "seller_campaign_participations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seller_campaign_participations_campaign_shop_key" ON "seller_campaign_participations"("campaign_id", "shop_id");
CREATE INDEX "seller_campaign_participations_shop_state_idx" ON "seller_campaign_participations"("shop_id", "state", "updated_at" DESC, "id");
CREATE INDEX "seller_campaign_participations_campaign_state_idx" ON "seller_campaign_participations"("campaign_id", "state", "updated_at" DESC, "id");

CREATE TABLE "seller_campaign_products" (
  "participation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "discount_basis_points" INTEGER NOT NULL,
  "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validation_metadata" JSONB,
  CONSTRAINT "seller_campaign_products_pkey" PRIMARY KEY ("participation_id", "product_id"),
  CONSTRAINT "seller_campaign_products_discount_check" CHECK ("discount_basis_points" >= 1 AND "discount_basis_points" <= 9000),
  CONSTRAINT "seller_campaign_products_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "seller_campaign_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "seller_campaign_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seller_campaign_products_product_accepted_idx" ON "seller_campaign_products"("product_id", "accepted_at" DESC);

CREATE TABLE "marketplace_campaign_commands" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "campaign_id" UUID,
  "scope" VARCHAR(80) NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_campaign_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_campaign_commands_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "marketplace_campaign_commands_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "marketplace_campaign_commands_actor_key" ON "marketplace_campaign_commands"("actor_user_id", "idempotency_key");
CREATE INDEX "marketplace_campaign_commands_campaign_scope_idx" ON "marketplace_campaign_commands"("campaign_id", "scope", "created_at" DESC);

CREATE TABLE "marketplace_campaign_audits" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "participation_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "reason" VARCHAR(240),
  "version_from" INTEGER,
  "version_to" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_campaign_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketplace_campaign_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "marketplace_campaign_audits_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "marketplace_campaign_audits_campaign_created_idx" ON "marketplace_campaign_audits"("campaign_id", "created_at" DESC, "id");
CREATE INDEX "marketplace_campaign_audits_participation_created_idx" ON "marketplace_campaign_audits"("participation_id", "created_at" DESC, "id");

CREATE TABLE "product_promotion_reservations" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "source" "marketplace_campaign_reservation_source" NOT NULL,
  "shop_campaign_id" UUID,
  "marketplace_campaign_id" UUID,
  "discount_basis_points" INTEGER NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_promotion_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_promotion_reservations_window_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "product_promotion_reservations_source_check" CHECK (("source" = 'shop_campaign' AND "shop_campaign_id" IS NOT NULL AND "marketplace_campaign_id" IS NULL) OR ("source" = 'marketplace_campaign' AND "marketplace_campaign_id" IS NOT NULL AND "shop_campaign_id" IS NULL)),
  CONSTRAINT "product_promotion_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_promotion_reservations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_promotion_reservations_shop_campaign_id_fkey" FOREIGN KEY ("shop_campaign_id") REFERENCES "shop_discount_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_promotion_reservations_marketplace_campaign_id_fkey" FOREIGN KEY ("marketplace_campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "product_promotion_reservations_product_window_idx" ON "product_promotion_reservations"("product_id", "is_enabled", "starts_at", "ends_at");
CREATE INDEX "product_promotion_reservations_shop_window_idx" ON "product_promotion_reservations"("shop_id", "is_enabled", "starts_at", "ends_at");

-- Preserve existing shop-discount behavior in the shared reservation table.
-- Fail with the conflicting product and windows so an operator can repair the
-- legacy data before enabling the exclusion constraint.
DO $$
DECLARE conflict_row RECORD;
BEGIN
  SELECT a."product_id", a."campaign_id" AS first_campaign, b."campaign_id" AS second_campaign,
         c1."starts_at" AS first_starts_at, c1."ends_at" AS first_ends_at,
         c2."starts_at" AS second_starts_at, c2."ends_at" AS second_ends_at
    INTO conflict_row
    FROM "shop_discount_products" a
    JOIN "shop_discount_campaigns" c1 ON c1."id" = a."campaign_id"
    JOIN "shop_discount_products" b ON b."product_id" = a."product_id" AND b."campaign_id" > a."campaign_id"
    JOIN "shop_discount_campaigns" c2 ON c2."id" = b."campaign_id"
   WHERE c1."is_enabled" AND c2."is_enabled"
     AND c1."archived_at" IS NULL AND c2."archived_at" IS NULL
     AND tstzrange(c1."starts_at", c1."ends_at", '[)') && tstzrange(c2."starts_at", c2."ends_at", '[)')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Marketplace campaign migration stopped: product % has overlapping shop campaigns % (%) and % (%). Repair the windows before retrying.',
      conflict_row."product_id", conflict_row.first_campaign, conflict_row.first_starts_at, conflict_row.second_campaign, conflict_row.second_starts_at;
  END IF;
END $$;

INSERT INTO "product_promotion_reservations" (
  "id", "product_id", "shop_id", "source", "shop_campaign_id", "discount_basis_points", "starts_at", "ends_at"
)
SELECT gen_random_uuid(), sdp."product_id", sdc."shop_id", 'shop_campaign', sdp."campaign_id", sdp."discount_basis_points", sdc."starts_at", sdc."ends_at"
  FROM "shop_discount_products" sdp
  JOIN "shop_discount_campaigns" sdc ON sdc."id" = sdp."campaign_id"
 WHERE sdc."is_enabled" AND sdc."archived_at" IS NULL;

ALTER TABLE "product_promotion_reservations"
  ADD CONSTRAINT "product_promotion_reservations_no_overlap"
  EXCLUDE USING GIST ("product_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("is_enabled");

CREATE TABLE "homepage_campaign_collections" (
  "id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "type_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "homepage_campaign_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homepage_campaign_collections_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "homepage_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homepage_campaign_collections_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homepage_campaign_collections_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "marketplace_campaign_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "homepage_campaign_collections_module_campaign_key" ON "homepage_campaign_collections"("module_id", "campaign_id");
CREATE INDEX "homepage_campaign_collections_module_enabled_idx" ON "homepage_campaign_collections"("module_id", "is_enabled", "sort_order");
CREATE INDEX "homepage_campaign_collections_campaign_enabled_idx" ON "homepage_campaign_collections"("campaign_id", "is_enabled");
