ALTER TABLE "voucher_consumptions"
  ADD COLUMN "idempotency_key" UUID;

UPDATE "voucher_consumptions"
SET "idempotency_key" = "purchase_reference"
WHERE "idempotency_key" IS NULL;

ALTER TABLE "voucher_consumptions"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX "voucher_consumptions_idempotency_key_key"
  ON "voucher_consumptions"("idempotency_key");

ALTER TABLE "inventory_reservations"
  ADD COLUMN "terminal_idempotency_key" UUID;
