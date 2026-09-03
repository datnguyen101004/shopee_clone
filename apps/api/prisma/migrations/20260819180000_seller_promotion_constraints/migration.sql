-- Promotion invariants are additive and preserve all existing voucher eligibility fields.
ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_window_check" CHECK ("starts_at" < "ends_at"),
  ADD CONSTRAINT "vouchers_usage_bounds_check" CHECK ("usage_limit" > 0 AND "per_buyer_limit" > 0 AND "used_count" >= 0 AND "used_count" <= "usage_limit"),
  ADD CONSTRAINT "vouchers_version_check" CHECK ("version" >= 0),
  ADD CONSTRAINT "vouchers_benefit_bounds_check" CHECK (
    ("benefit_type" = 'fixed_amount' AND "fixed_amount_minor" IS NOT NULL AND "fixed_amount_minor" > 0 AND "percentage_basis_points" IS NULL)
    OR ("benefit_type" = 'percentage' AND "percentage_basis_points" BETWEEN 100 AND 9000 AND "fixed_amount_minor" IS NULL)
    OR ("benefit_type" = 'free_shipping' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" IS NULL)
  ),
  ADD CONSTRAINT "vouchers_money_bounds_check" CHECK ("minimum_spend_minor" >= 0 AND ("maximum_discount_minor" IS NULL OR "maximum_discount_minor" > 0));

ALTER TABLE "shop_discount_campaigns"
  ADD CONSTRAINT "shop_discount_campaigns_archive_window_check" CHECK ("archived_at" IS NULL OR "archived_at" >= "created_at");

CREATE INDEX "shop_orders_shop_id_status_created_at_id_idx" ON "shop_orders" ("shop_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "order_lines_product_id_order_id_idx" ON "order_lines" ("product_id", "order_id", "id");
CREATE INDEX "product_variants_status_deleted_at_product_id_idx" ON "product_variants" ("status", "deleted_at", "product_id", "id");
