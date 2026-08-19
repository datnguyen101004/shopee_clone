BEGIN;

ALTER TYPE "inventory_adjustment_reason" ADD VALUE IF NOT EXISTS 'order_cancellation';

CREATE TYPE "seller_order_fulfillment_state" AS ENUM (
  'pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup',
  'handed_off', 'rejected', 'cancelled'
);
CREATE TYPE "seller_order_shipment_provider" AS ENUM ('mock');
CREATE TYPE "seller_order_shipment_status" AS ENUM ('handed_off');

ALTER TABLE "inventory_adjustments"
  ADD COLUMN "source_order_id" UUID;

CREATE TABLE "seller_order_fulfillments" (
  "order_id" UUID NOT NULL,
  "state" "seller_order_fulfillment_state" NOT NULL DEFAULT 'pending_confirmation',
  "version" INTEGER NOT NULL DEFAULT 0,
  "confirmation_deadline_at" TIMESTAMPTZ(3) NOT NULL,
  "handoff_deadline_at" TIMESTAMPTZ(3),
  "confirmed_at" TIMESTAMPTZ(3),
  "preparing_at" TIMESTAMPTZ(3),
  "ready_for_pickup_at" TIMESTAMPTZ(3),
  "handed_off_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_order_fulfillments_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "seller_order_fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_order_fulfillments_version_check" CHECK ("version" >= 0)
);
CREATE INDEX "seller_order_fulfillments_state_updated_at_order_id_idx" ON "seller_order_fulfillments"("state", "updated_at" DESC, "order_id" DESC);
CREATE INDEX "seller_order_fulfillments_confirmation_deadline_at_state_idx" ON "seller_order_fulfillments"("confirmation_deadline_at", "state");
CREATE INDEX "seller_order_fulfillments_handoff_deadline_at_state_idx" ON "seller_order_fulfillments"("handoff_deadline_at", "state");

CREATE TABLE "seller_order_fulfillment_events" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "previous_state" "seller_order_fulfillment_state",
  "state" "seller_order_fulfillment_state" NOT NULL,
  "fulfillment_version" INTEGER NOT NULL,
  "actor_type" "order_timeline_actor" NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(40) NOT NULL,
  "reason_code" VARCHAR(80) NOT NULL,
  "reason_note" VARCHAR(500),
  "late" BOOLEAN NOT NULL DEFAULT FALSE,
  "idempotency_key" UUID,
  "request_digest" CHAR(64),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_order_fulfillment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_order_fulfillment_events_fulfillment_fkey" FOREIGN KEY ("order_id") REFERENCES "seller_order_fulfillments"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_order_fulfillment_events_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_order_fulfillment_events_version_check" CHECK ("fulfillment_version" >= 0),
  CONSTRAINT "seller_order_fulfillment_events_actor_check" CHECK ("actor_type" = 'system' OR "actor_user_id" IS NOT NULL),
  CONSTRAINT "seller_order_fulfillment_events_digest_check" CHECK (("idempotency_key" IS NULL AND "request_digest" IS NULL) OR ("idempotency_key" IS NOT NULL AND "request_digest" ~ '^[0-9a-f]{64}$')),
  CONSTRAINT "seller_order_fulfillment_events_note_check" CHECK ("reason_note" IS NULL OR length("reason_note") <= 500)
);
CREATE UNIQUE INDEX "seller_order_fulfillment_events_order_id_fulfillment_version_key" ON "seller_order_fulfillment_events"("order_id", "fulfillment_version");
CREATE UNIQUE INDEX "seller_order_fulfillment_events_order_id_idempotency_key_key" ON "seller_order_fulfillment_events"("order_id", "idempotency_key");
CREATE INDEX "seller_order_fulfillment_events_order_id_occurred_at_id_idx" ON "seller_order_fulfillment_events"("order_id", "occurred_at", "id");
CREATE INDEX "seller_order_fulfillment_events_actor_user_id_occurred_at_id_idx" ON "seller_order_fulfillment_events"("actor_user_id", "occurred_at", "id");

CREATE TABLE "seller_order_shipments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "provider" "seller_order_shipment_provider" NOT NULL,
  "tracking_code" VARCHAR(80) NOT NULL,
  "status" "seller_order_shipment_status" NOT NULL DEFAULT 'handed_off',
  "service" VARCHAR(40) NOT NULL,
  "shipping_snapshot" JSONB NOT NULL,
  "handed_off_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_order_shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_order_shipments_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "seller_order_shipments_tracking_code_key" UNIQUE ("tracking_code"),
  CONSTRAINT "seller_order_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seller_order_shipments_status_handed_off_at_id_idx" ON "seller_order_shipments"("status", "handed_off_at" DESC, "id");

CREATE TABLE "seller_order_shipment_events" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "status" "seller_order_shipment_status" NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_order_shipment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_order_shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "seller_order_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seller_order_shipment_events_shipment_id_occurred_at_id_idx" ON "seller_order_shipment_events"("shipment_id", "occurred_at", "id");

CREATE TABLE "seller_order_inventory_compensations" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "reason" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_order_inventory_compensations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_order_inventory_compensations_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "seller_order_inventory_compensations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_order_inventory_compensations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seller_order_inventory_compensations_actor_user_id_created_at_id_idx" ON "seller_order_inventory_compensations"("actor_user_id", "created_at", "id");

ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "inventory_adjustments_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_adjustments_source_order_id_variant_id_occurred_at_idx" ON "inventory_adjustments"("source_order_id", "variant_id", "occurred_at" DESC);
CREATE UNIQUE INDEX "inventory_adjustments_order_cancellation_source_variant_key" ON "inventory_adjustments"("source_order_id", "variant_id");

INSERT INTO "seller_order_fulfillments" (
  "order_id", "state", "version", "confirmation_deadline_at", "handoff_deadline_at",
  "confirmed_at", "handed_off_at", "cancelled_at", "created_at", "updated_at"
)
SELECT
  so."id",
  CASE
    WHEN so."status" = 'pending_confirmation' THEN 'pending_confirmation'::"seller_order_fulfillment_state"
    WHEN so."status" = 'awaiting_pickup' THEN 'confirmed'::"seller_order_fulfillment_state"
    WHEN so."status" = 'cancelled' THEN 'cancelled'::"seller_order_fulfillment_state"
    ELSE 'handed_off'::"seller_order_fulfillment_state"
  END,
  0,
  so."created_at" + interval '24 hours',
  CASE WHEN so."status" IN ('awaiting_pickup', 'shipping', 'delivered', 'return_requested', 'returned', 'refunded') THEN so."updated_at" + interval '48 hours' ELSE NULL END,
  CASE WHEN so."status" IN ('awaiting_pickup', 'shipping', 'delivered', 'return_requested', 'returned', 'refunded') THEN so."updated_at" ELSE NULL END,
  CASE WHEN so."status" IN ('shipping', 'delivered', 'return_requested', 'returned', 'refunded') THEN so."updated_at" ELSE NULL END,
  CASE WHEN so."status" = 'cancelled' THEN so."updated_at" ELSE NULL END,
  so."created_at",
  so."updated_at"
FROM "shop_orders" so;

INSERT INTO "seller_order_fulfillment_events" (
  "id", "order_id", "previous_state", "state", "fulfillment_version", "actor_type", "action", "reason_code", "occurred_at"
)
SELECT gen_random_uuid(), "order_id", NULL, "state", 0, 'system', 'ORDER_CREATED', 'LEGACY_BACKFILL', "created_at"
FROM "seller_order_fulfillments";

COMMIT;
