CREATE TYPE "review_visibility" AS ENUM ('visible', 'hidden');
CREATE TYPE "review_media_state" AS ENUM ('staged', 'attached');

ALTER TABLE "shops"
  ADD COLUMN "rating_average_basis_points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "shops_rating_summary_check" CHECK ("rating_average_basis_points" BETWEEN 0 AND 500 AND "rating_count" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_rating_summary_check" CHECK ("rating_average_basis_points" BETWEEN 0 AND 500 AND "rating_count" >= 0);

UPDATE "products" SET "rating_average_basis_points" = 0, "rating_count" = 0;

CREATE TABLE "product_reviews" (
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

CREATE TABLE "review_media" (
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

CREATE TABLE "review_moderation_events" (
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

CREATE UNIQUE INDEX "product_reviews_order_line_id_key" ON "product_reviews"("order_line_id");
CREATE UNIQUE INDEX "product_reviews_buyer_user_id_idempotency_key_key" ON "product_reviews"("buyer_user_id", "idempotency_key");
CREATE INDEX "product_reviews_buyer_user_id_updated_at_id_idx" ON "product_reviews"("buyer_user_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "product_reviews_product_id_visibility_rating_updated_at_id_idx" ON "product_reviews"("product_id", "visibility", "rating", "updated_at" DESC, "id" DESC);
CREATE INDEX "product_reviews_shop_id_visibility_updated_at_id_idx" ON "product_reviews"("shop_id", "visibility", "updated_at" DESC, "id" DESC);
CREATE UNIQUE INDEX "review_media_storage_key_key" ON "review_media"("storage_key");
CREATE UNIQUE INDEX "review_media_review_id_sort_order_key" ON "review_media"("review_id", "sort_order");
CREATE INDEX "review_media_uploader_id_state_expires_at_idx" ON "review_media"("uploader_id", "state", "expires_at");
CREATE INDEX "review_media_state_expires_at_idx" ON "review_media"("state", "expires_at");
CREATE INDEX "review_moderation_events_review_id_created_at_id_idx" ON "review_moderation_events"("review_id", "created_at", "id");

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_moderation_events" ADD CONSTRAINT "review_moderation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
