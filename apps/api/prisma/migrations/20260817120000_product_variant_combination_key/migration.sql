ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "combination_key" VARCHAR(240);
UPDATE "product_variants" SET "combination_key" = CONCAT('legacy-', "id"::text) WHERE "combination_key" IS NULL OR "combination_key" = '';
ALTER TABLE "product_variants" ALTER COLUMN "combination_key" SET NOT NULL;
ALTER TABLE "product_variants" ALTER COLUMN "combination_key" SET DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_combination_live_key" ON "product_variants"("product_id", "combination_key") WHERE "deleted_at" IS NULL;

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "shop_id" UUID;
UPDATE "product_variants" AS variant SET "shop_id" = product."shop_id" FROM "products" AS product WHERE variant."product_id" = product."id" AND variant."shop_id" IS NULL;
ALTER TABLE "product_variants" ALTER COLUMN "shop_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "product_variants_shop_id_idx" ON "product_variants"("shop_id");
