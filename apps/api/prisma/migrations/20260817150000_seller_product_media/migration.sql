CREATE TYPE "seller_product_media_state" AS ENUM ('staged', 'attached');

ALTER TABLE "seller_product_option_values"
  ADD COLUMN "image_id" UUID;

CREATE TABLE "seller_product_media_assets" (
  "id" UUID NOT NULL,
  "uploader_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID,
  "product_image_id" UUID,
  "storage_key" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(32) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "state" "seller_product_media_state" NOT NULL DEFAULT 'staged',
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "seller_product_media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_product_media_assets_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_product_media_assets_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_product_media_assets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "seller_product_media_assets_product_image_id_fkey" FOREIGN KEY ("product_image_id") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "seller_product_option_values"
  ADD CONSTRAINT "seller_product_option_values_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "seller_product_media_assets"
  ADD CONSTRAINT "seller_product_media_assets_product_image_id_key" UNIQUE ("product_image_id");

CREATE UNIQUE INDEX "seller_product_media_assets_storage_key_key" ON "seller_product_media_assets"("storage_key");
CREATE INDEX "seller_product_media_assets_uploader_id_state_expires_at_idx" ON "seller_product_media_assets"("uploader_id", "state", "expires_at");
CREATE INDEX "seller_product_media_assets_shop_id_product_id_state_idx" ON "seller_product_media_assets"("shop_id", "product_id", "state");
CREATE INDEX "seller_product_media_assets_state_expires_at_idx" ON "seller_product_media_assets"("state", "expires_at");
