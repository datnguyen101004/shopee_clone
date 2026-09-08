-- Support Admin shop pages in their default and fully-filtered forms.
CREATE INDEX "shops_deleted_at_updated_at_id_idx"
ON "shops"("deleted_at", "updated_at" DESC, "id" DESC);

CREATE INDEX "shops_deleted_at_status_onboarding_status_updated_at_id_idx"
ON "shops"("deleted_at", "status", "onboarding_status", "updated_at" DESC, "id" DESC);

-- The Admin product list always fixes lifecycle status to ACTIVE and may filter moderation status.
CREATE INDEX "products_deleted_at_status_updated_at_id_idx"
ON "products"("deleted_at", "status", "updated_at" DESC, "id" DESC);

CREATE INDEX "products_deleted_at_status_moderation_status_updated_at_id_idx"
ON "products"("deleted_at", "status", "moderation_status", "updated_at" DESC, "id" DESC);
