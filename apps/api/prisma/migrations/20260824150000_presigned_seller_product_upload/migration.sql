ALTER TYPE "seller_product_media_state" ADD VALUE IF NOT EXISTS 'pending_upload';

ALTER TABLE "seller_product_media_assets"
  ALTER COLUMN "width" DROP NOT NULL,
  ALTER COLUMN "height" DROP NOT NULL,
  ADD COLUMN "checksum_sha256" VARCHAR(64),
  ADD COLUMN "upload_expires_at" TIMESTAMPTZ(3);

CREATE INDEX "seller_product_media_assets_uploader_state_upload_expires_idx"
  ON "seller_product_media_assets"("uploader_id", "state", "upload_expires_at");

CREATE INDEX "seller_product_media_assets_state_upload_expires_idx"
  ON "seller_product_media_assets"("state", "upload_expires_at");
