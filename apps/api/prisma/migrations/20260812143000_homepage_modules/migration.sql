-- CreateEnum
CREATE TYPE "homepage_module_type" AS ENUM ('campaign_banner', 'category_shortcuts', 'flash_sale', 'top_selling', 'mall', 'daily_recommendations');

-- CreateTable
CREATE TABLE "homepage_modules" (
  "id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "type" "homepage_module_type" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "subtitle" VARCHAR(240),
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active_from" TIMESTAMPTZ(3),
  "active_until" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "homepage_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homepage_modules_valid_window" CHECK ("active_from" IS NULL OR "active_until" IS NULL OR "active_until" > "active_from")
);

CREATE TABLE "homepage_banners" (
  "id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "eyebrow" VARCHAR(80),
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(320),
  "image_url" TEXT,
  "alt_text" VARCHAR(240),
  "destination_path" VARCHAR(500) NOT NULL,
  "theme_key" VARCHAR(40) NOT NULL DEFAULT 'brand',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "homepage_banners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homepage_module_categories" (
  "id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "label" VARCHAR(160),
  "icon_key" VARCHAR(40),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "homepage_module_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homepage_module_products" (
  "id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "label" VARCHAR(120),
  "sold_count" INTEGER,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "homepage_module_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homepage_module_products_sold_count_nonnegative" CHECK ("sold_count" IS NULL OR "sold_count" >= 0)
);

CREATE UNIQUE INDEX "homepage_modules_key_key" ON "homepage_modules"("key");
CREATE INDEX "homepage_modules_is_enabled_active_from_active_until_sort_order_idx" ON "homepage_modules"("is_enabled", "active_from", "active_until", "sort_order");
CREATE UNIQUE INDEX "homepage_banners_module_id_sort_order_key" ON "homepage_banners"("module_id", "sort_order");
CREATE UNIQUE INDEX "homepage_module_categories_module_id_category_id_key" ON "homepage_module_categories"("module_id", "category_id");
CREATE UNIQUE INDEX "homepage_module_categories_module_id_sort_order_key" ON "homepage_module_categories"("module_id", "sort_order");
CREATE UNIQUE INDEX "homepage_module_products_module_id_product_id_key" ON "homepage_module_products"("module_id", "product_id");
CREATE UNIQUE INDEX "homepage_module_products_module_id_sort_order_key" ON "homepage_module_products"("module_id", "sort_order");

ALTER TABLE "homepage_banners" ADD CONSTRAINT "homepage_banners_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "homepage_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homepage_module_categories" ADD CONSTRAINT "homepage_module_categories_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "homepage_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homepage_module_categories" ADD CONSTRAINT "homepage_module_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homepage_module_products" ADD CONSTRAINT "homepage_module_products_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "homepage_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homepage_module_products" ADD CONSTRAINT "homepage_module_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
