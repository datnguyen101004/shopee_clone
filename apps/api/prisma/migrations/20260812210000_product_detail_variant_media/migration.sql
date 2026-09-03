ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_product_id_id_key" UNIQUE ("product_id", "id");

ALTER TABLE "product_images"
  ADD COLUMN "variant_id" UUID;

ALTER TABLE "product_images"
  ADD CONSTRAINT "product_images_product_id_variant_id_fkey"
  FOREIGN KEY ("product_id", "variant_id")
  REFERENCES "product_variants" ("product_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "product_images_product_id_variant_id_idx"
  ON "product_images" ("product_id", "variant_id");
