ALTER TYPE "product_status" ADD VALUE IF NOT EXISTS 'hidden';

CREATE TYPE "product_moderation_status" AS ENUM ('active', 'suspended');

ALTER TABLE "products"
  ADD COLUMN "moderation_status" "product_moderation_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "package_length_mm" INTEGER,
  ADD COLUMN "package_width_mm" INTEGER,
  ADD COLUMN "package_height_mm" INTEGER;

CREATE TABLE "category_attribute_definitions" (
  "id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "allowed_values" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "category_attribute_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "category_attribute_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "category_attribute_definitions_category_id_code_key" ON "category_attribute_definitions"("category_id", "code");
CREATE INDEX "category_attribute_definitions_category_id_sort_order_idx" ON "category_attribute_definitions"("category_id", "sort_order");

CREATE TABLE "product_attribute_values" (
  "product_id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "value" VARCHAR(240) NOT NULL,
  CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("product_id", "definition_id"),
  CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_attribute_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "category_attribute_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "product_attribute_values_definition_id_idx" ON "product_attribute_values"("definition_id");

CREATE TABLE "product_option_groups" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "product_option_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_option_groups_product_id_sort_order_key" ON "product_option_groups"("product_id", "sort_order");

CREATE TABLE "seller_product_option_values" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "value" VARCHAR(120) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "seller_product_option_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_product_option_values_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seller_product_option_values_group_id_value_key" ON "seller_product_option_values"("group_id", "value");
CREATE UNIQUE INDEX "seller_product_option_values_group_id_sort_order_key" ON "seller_product_option_values"("group_id", "sort_order");

CREATE TABLE "seller_product_variant_option_values" (
  "variant_id" UUID NOT NULL,
  "option_value_id" UUID NOT NULL,
  CONSTRAINT "seller_product_variant_option_values_pkey" PRIMARY KEY ("variant_id", "option_value_id"),
  CONSTRAINT "seller_product_variant_option_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "seller_product_variant_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "seller_product_option_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seller_product_variant_option_values_option_value_id_idx" ON "seller_product_variant_option_values"("option_value_id");
CREATE INDEX "products_status_moderation_status_idx" ON "products"("status", "moderation_status");
