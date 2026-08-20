ALTER TABLE "vouchers"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "archived_at" TIMESTAMPTZ(3);

CREATE TYPE "seller_promotion_resource" AS ENUM ('voucher', 'discount');

CREATE TABLE "shop_discount_campaigns" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_discount_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_discount_campaigns_window_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "shop_discount_campaigns_version_check" CHECK ("version" >= 0),
  CONSTRAINT "shop_discount_campaigns_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "shop_discount_products" (
  "campaign_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "discount_basis_points" INTEGER NOT NULL,
  CONSTRAINT "shop_discount_products_pkey" PRIMARY KEY ("campaign_id", "product_id"),
  CONSTRAINT "shop_discount_products_rate_check" CHECK ("discount_basis_points" BETWEEN 100 AND 9000),
  CONSTRAINT "shop_discount_products_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "shop_discount_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shop_discount_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "seller_promotion_commands" (
  "id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "resource" "seller_promotion_resource" NOT NULL,
  "resource_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_promotion_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_promotion_commands_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "vouchers_shop_id_version_updated_at_id_idx" ON "vouchers"("shop_id", "version", "updated_at" DESC, "id");
CREATE INDEX "shop_discount_campaigns_shop_id_created_at_id_idx" ON "shop_discount_campaigns"("shop_id", "created_at" DESC, "id");
CREATE INDEX "shop_discount_campaigns_shop_id_is_enabled_starts_at_ends_at_idx" ON "shop_discount_campaigns"("shop_id", "is_enabled", "starts_at", "ends_at");
CREATE INDEX "shop_discount_campaigns_archived_at_idx" ON "shop_discount_campaigns"("archived_at");
CREATE INDEX "shop_discount_products_product_id_campaign_id_idx" ON "shop_discount_products"("product_id", "campaign_id");
CREATE UNIQUE INDEX "seller_promotion_commands_shop_id_idempotency_key_key" ON "seller_promotion_commands"("shop_id", "idempotency_key");
CREATE INDEX "seller_promotion_commands_resource_resource_id_created_at_idx" ON "seller_promotion_commands"("resource", "resource_id", "created_at" DESC);
