CREATE TYPE "homepage_banner_media_state" AS ENUM ('pending_upload', 'staged', 'attached', 'deleting');

CREATE TABLE "homepage_banner_media_assets" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "banner_id" UUID,
    "storage_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(32) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum_sha256" VARCHAR(64),
    "upload_expires_at" TIMESTAMPTZ(3),
    "state" "homepage_banner_media_state" NOT NULL DEFAULT 'staged',
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homepage_banner_media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "homepage_banner_media_assets_banner_id_key"
ON "homepage_banner_media_assets"("banner_id");

CREATE UNIQUE INDEX "homepage_banner_media_assets_storage_key_key"
ON "homepage_banner_media_assets"("storage_key");

CREATE INDEX "homepage_banner_media_assets_uploader_id_state_expires_at_idx"
ON "homepage_banner_media_assets"("uploader_id", "state", "expires_at");

CREATE INDEX "homepage_banner_media_assets_state_expires_at_idx"
ON "homepage_banner_media_assets"("state", "expires_at");

ALTER TABLE "homepage_banner_media_assets"
ADD CONSTRAINT "homepage_banner_media_assets_uploader_id_fkey"
FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "homepage_banner_media_assets"
ADD CONSTRAINT "homepage_banner_media_assets_banner_id_fkey"
FOREIGN KEY ("banner_id") REFERENCES "homepage_banners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "homepage_banner_media_assets"
ADD CONSTRAINT "homepage_banner_media_assets_byte_size_check"
CHECK ("byte_size" > 0 AND "byte_size" <= 5000000);
