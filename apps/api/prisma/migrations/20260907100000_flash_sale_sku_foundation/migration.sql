CREATE TABLE "flash_sale_skus" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "participation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "reference_price_minor" BIGINT NOT NULL,
  "sale_price_minor" BIGINT NOT NULL,
  "allocated_quantity" INTEGER NOT NULL,
  "remaining_quantity" INTEGER NOT NULL,
  "net_consumed_quantity" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "management_epoch" INTEGER NOT NULL DEFAULT 1,
  "ended_at" TIMESTAMPTZ(3),
  "ended_reason" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flash_sale_skus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flash_sale_skus_campaign_variant_key" UNIQUE ("campaign_id", "variant_id"),
  CONSTRAINT "flash_sale_skus_quantity_check" CHECK ("allocated_quantity" >= 0 AND "remaining_quantity" >= 0 AND "net_consumed_quantity" >= 0 AND "remaining_quantity" <= "allocated_quantity"),
  CONSTRAINT "flash_sale_skus_price_check" CHECK ("reference_price_minor" > 0 AND "sale_price_minor" > 0 AND "sale_price_minor" < "reference_price_minor")
);
CREATE INDEX "flash_sale_skus_campaign_product_remaining_idx" ON "flash_sale_skus"("campaign_id", "product_id", "remaining_quantity");
CREATE INDEX "flash_sale_skus_participation_remaining_ended_idx" ON "flash_sale_skus"("participation_id", "remaining_quantity", "ended_at");
CREATE INDEX "flash_sale_skus_variant_campaign_idx" ON "flash_sale_skus"("variant_id", "campaign_id");
ALTER TABLE "flash_sale_skus" ADD CONSTRAINT "flash_sale_skus_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flash_sale_skus" ADD CONSTRAINT "flash_sale_skus_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "seller_campaign_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flash_sale_skus" ADD CONSTRAINT "flash_sale_skus_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_skus" ADD CONSTRAINT "flash_sale_skus_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flash_sale_buyer_claims" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "buyer_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flash_sale_buyer_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flash_sale_buyer_claims_campaign_buyer_product_key" UNIQUE ("campaign_id", "buyer_id", "product_id"),
  CONSTRAINT "flash_sale_buyer_claims_order_line_key" UNIQUE ("order_line_id")
);
CREATE INDEX "flash_sale_buyer_claims_buyer_created_idx" ON "flash_sale_buyer_claims"("buyer_id", "created_at" DESC);
CREATE INDEX "flash_sale_buyer_claims_campaign_product_idx" ON "flash_sale_buyer_claims"("campaign_id", "product_id");
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketplace_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_buyer_claims" ADD CONSTRAINT "flash_sale_buyer_claims_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flash_sale_consumptions" (
  "id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "flash_sale_sku_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sale_price_minor" BIGINT NOT NULL,
  "reversed_at" TIMESTAMPTZ(3),
  "reversal_destination" VARCHAR(16),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flash_sale_consumptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flash_sale_consumptions_order_line_key" UNIQUE ("order_line_id"),
  CONSTRAINT "flash_sale_consumptions_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "flash_sale_consumptions_sku_reversed_idx" ON "flash_sale_consumptions"("flash_sale_sku_id", "reversed_at");
ALTER TABLE "flash_sale_consumptions" ADD CONSTRAINT "flash_sale_consumptions_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flash_sale_consumptions" ADD CONSTRAINT "flash_sale_consumptions_flash_sale_sku_id_fkey" FOREIGN KEY ("flash_sale_sku_id") REFERENCES "flash_sale_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flash_sale_outbox" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "flash_sale_sku_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "management_epoch" INTEGER NOT NULL,
  "operation_token" UUID,
  "admission_delta" INTEGER NOT NULL DEFAULT 0,
  "public_snapshot" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flash_sale_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flash_sale_outbox_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "flash_sale_outbox_sku_sequence_key" UNIQUE ("flash_sale_sku_id", "sequence")
);
CREATE INDEX "flash_sale_outbox_processed_created_idx" ON "flash_sale_outbox"("processed_at", "created_at");
ALTER TABLE "flash_sale_outbox" ADD CONSTRAINT "flash_sale_outbox_flash_sale_sku_id_fkey" FOREIGN KEY ("flash_sale_sku_id") REFERENCES "flash_sale_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
