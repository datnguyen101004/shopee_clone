-- Add a positive deterministic shipping weight without requiring a database reset.
ALTER TABLE "product_variants"
ADD COLUMN "weight_grams" INTEGER;

UPDATE "product_variants"
SET "weight_grams" = 500
WHERE "weight_grams" IS NULL;

ALTER TABLE "product_variants"
ALTER COLUMN "weight_grams" SET DEFAULT 500,
ALTER COLUMN "weight_grams" SET NOT NULL;

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_weight_grams_check"
CHECK ("weight_grams" BETWEEN 1 AND 1000000);
