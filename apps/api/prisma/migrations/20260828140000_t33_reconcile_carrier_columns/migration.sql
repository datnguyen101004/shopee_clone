-- Reconcile the T33 carrier schema for databases where the original
-- migration was applied before the idempotency/callback result columns were
-- added to the Prisma model. Every operation is additive and safe on a fresh
-- database where the columns already exist.

ALTER TABLE "seller_order_shipment_events"
  ADD COLUMN IF NOT EXISTS "command_id" UUID,
  ADD COLUMN IF NOT EXISTS "command_digest" CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "seller_order_shipment_events_command_id_key"
  ON "seller_order_shipment_events" ("command_id");
CREATE INDEX IF NOT EXISTS "seller_order_shipment_events_command_id_idx"
  ON "seller_order_shipment_events" ("command_id");

ALTER TABLE "carrier_callback_receipts"
  ADD COLUMN IF NOT EXISTS "result_status" "seller_order_shipment_status",
  ADD COLUMN IF NOT EXISTS "result_version" INTEGER;
