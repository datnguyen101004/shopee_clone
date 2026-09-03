ALTER TABLE "products"
  ADD COLUMN "purge_blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "purge_block_reason" VARCHAR(80);

CREATE INDEX "products_deleted_at_purge_blocked_at_id_idx"
  ON "products"("deleted_at", "purge_blocked_at", "id");
