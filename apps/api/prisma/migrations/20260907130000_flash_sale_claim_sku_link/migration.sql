ALTER TABLE "flash_sale_buyer_claims"
  ADD COLUMN "flash_sale_sku_id" UUID;

CREATE INDEX "flash_sale_buyer_claims_flash_sale_sku_id_idx"
  ON "flash_sale_buyer_claims"("flash_sale_sku_id");

ALTER TABLE "flash_sale_buyer_claims"
  ADD CONSTRAINT "flash_sale_buyer_claims_flash_sale_sku_id_fkey"
  FOREIGN KEY ("flash_sale_sku_id") REFERENCES "flash_sale_skus"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
