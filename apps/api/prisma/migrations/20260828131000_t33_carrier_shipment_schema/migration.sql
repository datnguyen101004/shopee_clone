-- T33 additive shipment schema. Historical MOCK/HANDED_OFF rows remain valid.
ALTER TYPE "seller_order_shipment_provider" ADD VALUE IF NOT EXISTS 'demo_carrier';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'registration_pending';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'registration_failed';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'delivery_failed';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'return_in_transit';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE "seller_order_shipment_status" ADD VALUE IF NOT EXISTS 'returned';

ALTER TABLE "seller_order_shipments"
  ADD COLUMN IF NOT EXISTS "provider_version" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "external_shipment_id" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "shipment_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "registered_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "last_updated_at" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX IF NOT EXISTS "seller_order_shipments_external_shipment_id_key"
  ON "seller_order_shipments" ("external_shipment_id");
CREATE INDEX IF NOT EXISTS "seller_order_shipments_status_last_updated_at_id_idx"
  ON "seller_order_shipments" ("status", "last_updated_at" DESC, "id");
CREATE INDEX IF NOT EXISTS "seller_order_shipments_provider_external_shipment_id_idx"
  ON "seller_order_shipments" ("provider", "external_shipment_id");

ALTER TABLE "seller_order_shipment_events"
  ADD COLUMN IF NOT EXISTS "previous_status" "seller_order_shipment_status",
  ADD COLUMN IF NOT EXISTS "shipment_version" INTEGER;
UPDATE "seller_order_shipment_events" e
SET "shipment_version" = ranked.version
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY shipment_id ORDER BY occurred_at, id) - 1 AS version
  FROM "seller_order_shipment_events"
) ranked
WHERE e.id = ranked.id AND e.shipment_version IS NULL;
ALTER TABLE "seller_order_shipment_events"
  ALTER COLUMN "shipment_version" SET DEFAULT 0,
  ALTER COLUMN "shipment_version" SET NOT NULL,
  ADD COLUMN IF NOT EXISTS "external_event_id" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "public_reason" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "carrier_occurred_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "command_id" UUID,
  ADD COLUMN IF NOT EXISTS "command_digest" CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "seller_order_shipment_events_shipment_id_shipment_version_key"
  ON "seller_order_shipment_events" ("shipment_id", "shipment_version");
CREATE UNIQUE INDEX IF NOT EXISTS "seller_order_shipment_events_external_event_id_key"
  ON "seller_order_shipment_events" ("external_event_id");
CREATE INDEX IF NOT EXISTS "seller_order_shipment_events_external_event_id_idx"
  ON "seller_order_shipment_events" ("external_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "seller_order_shipment_events_command_id_key"
  ON "seller_order_shipment_events" ("command_id");
CREATE INDEX IF NOT EXISTS "seller_order_shipment_events_command_id_idx"
  ON "seller_order_shipment_events" ("command_id");

CREATE TABLE IF NOT EXISTS "carrier_dispatch_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL,
  "shipment_reference" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "payload_digest" CHAR(64) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "lease_owner" VARCHAR(120),
  "outcome" VARCHAR(40),
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_dispatch_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "carrier_dispatch_outbox_shipment_id_key" UNIQUE ("shipment_id"),
  CONSTRAINT "carrier_dispatch_outbox_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "seller_order_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "carrier_dispatch_outbox_next_attempt_at_lease_until_idx"
  ON "carrier_dispatch_outbox" ("next_attempt_at", "lease_until");
CREATE INDEX IF NOT EXISTS "carrier_dispatch_outbox_outcome_next_attempt_at_idx"
  ON "carrier_dispatch_outbox" ("outcome", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "carrier_callback_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "seller_order_shipment_provider" NOT NULL,
  "external_event_id" VARCHAR(120) NOT NULL,
  "payload_digest" CHAR(64) NOT NULL,
  "shipment_id" UUID,
  "outcome" VARCHAR(40) NOT NULL,
  "result_status" "seller_order_shipment_status",
  "result_version" INTEGER,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "carrier_callback_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "carrier_callback_receipts_provider_external_event_id_key" UNIQUE ("provider", "external_event_id"),
  CONSTRAINT "carrier_callback_receipts_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "seller_order_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "carrier_callback_receipts_shipment_id_received_at_idx"
  ON "carrier_callback_receipts" ("shipment_id", "received_at" DESC);
