CREATE INDEX IF NOT EXISTS "products_shop_id_deleted_at_updated_at_id_idx"
ON "products"("shop_id", "deleted_at", "updated_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "products_shop_id_deleted_at_status_updated_at_id_idx"
ON "products"("shop_id", "deleted_at", "status", "updated_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "vouchers_shop_id_archived_at_created_at_id_idx"
ON "vouchers"("shop_id", "archived_at", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "vouchers_shop_id_is_enabled_created_at_id_idx"
ON "vouchers"("shop_id", "is_enabled", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "marketplace_campaigns_created_at_id_idx"
ON "marketplace_campaigns"("created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "seller_review_reports_status_created_at_id_review_id_idx"
ON "seller_review_reports"("status", "created_at" DESC, "id" DESC, "review_id");
