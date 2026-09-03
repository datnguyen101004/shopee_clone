ALTER TYPE "shop_status" ADD VALUE 'suspended';

CREATE TYPE "shop_onboarding_status" AS ENUM ('pending_approval', 'approved', 'rejected');

DROP INDEX "shops_owner_id_key";

ALTER TABLE "shops"
  ADD COLUMN "description" VARCHAR(2000) NOT NULL DEFAULT '',
  ADD COLUMN "logo_url" VARCHAR(500),
  ADD COLUMN "banner_url" VARCHAR(500),
  ADD COLUMN "contact_phone" VARCHAR(10),
  ADD COLUMN "contact_email" VARCHAR(320),
  ADD COLUMN "pickup_recipient_name" VARCHAR(120),
  ADD COLUMN "pickup_phone_number" VARCHAR(10),
  ADD COLUMN "pickup_province" VARCHAR(100),
  ADD COLUMN "pickup_district" VARCHAR(100),
  ADD COLUMN "pickup_ward" VARCHAR(100),
  ADD COLUMN "pickup_address_line" VARCHAR(255),
  ADD COLUMN "return_recipient_name" VARCHAR(120),
  ADD COLUMN "return_phone_number" VARCHAR(10),
  ADD COLUMN "return_province" VARCHAR(100),
  ADD COLUMN "return_district" VARCHAR(100),
  ADD COLUMN "return_ward" VARCHAR(100),
  ADD COLUMN "return_address_line" VARCHAR(255),
  ADD COLUMN "onboarding_status" "shop_onboarding_status" NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN "onboarding_reason" VARCHAR(240);

UPDATE "shops"
SET "onboarding_status" = 'approved'
WHERE "deleted_at" IS NULL;

CREATE INDEX "shops_owner_id_idx" ON "shops"("owner_id");
CREATE INDEX "shops_onboarding_status_idx" ON "shops"("onboarding_status");

CREATE UNIQUE INDEX "shops_owner_id_live_key"
  ON "shops"("owner_id")
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "shops_name_live_key"
  ON "shops"(lower("name"))
  WHERE "deleted_at" IS NULL;
