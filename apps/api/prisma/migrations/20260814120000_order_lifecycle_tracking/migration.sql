ALTER TYPE "shop_order_status" ADD VALUE 'awaiting_pickup';
ALTER TYPE "shop_order_status" ADD VALUE 'shipping';
ALTER TYPE "shop_order_status" ADD VALUE 'delivered';
ALTER TYPE "shop_order_status" ADD VALUE 'cancelled';
ALTER TYPE "shop_order_status" ADD VALUE 'return_requested';
ALTER TYPE "shop_order_status" ADD VALUE 'returned';
ALTER TYPE "shop_order_status" ADD VALUE 'refunded';

CREATE TYPE "order_timeline_actor" AS ENUM ('system', 'buyer', 'seller', 'admin');

ALTER TABLE "shop_orders"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "shop_orders_version_check" CHECK ("version" >= 0);

CREATE TABLE "order_timeline_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "previous_status" "shop_order_status",
    "status" "shop_order_status" NOT NULL,
    "order_version" INTEGER NOT NULL,
    "actor_type" "order_timeline_actor" NOT NULL,
    "actor_user_id" UUID,
    "reason_code" VARCHAR(80) NOT NULL,
    "reason_note" VARCHAR(500),
    "idempotency_key" UUID,
    "request_digest" CHAR(64),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_timeline_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_timeline_events_version_check" CHECK ("order_version" >= 0),
    CONSTRAINT "order_timeline_events_transition_check" CHECK (
        ("order_version" = 0 AND "previous_status" IS NULL AND "status" = 'pending_confirmation') OR
        ("order_version" > 0 AND "previous_status" IS NOT NULL)
    ),
    CONSTRAINT "order_timeline_events_actor_check" CHECK (
        ("actor_type" = 'system' AND "actor_user_id" IS NULL) OR
        ("actor_type" <> 'system' AND "actor_user_id" IS NOT NULL)
    ),
    CONSTRAINT "order_timeline_events_reason_check" CHECK (
        "reason_code" ~ '^[A-Z][A-Z0-9_]{0,79}$' AND
        ("reason_note" IS NULL OR (btrim("reason_note") <> '' AND "reason_note" !~ '[[:cntrl:]]'))
    ),
    CONSTRAINT "order_timeline_events_idempotency_check" CHECK (
        ("idempotency_key" IS NULL AND "request_digest" IS NULL) OR
        ("idempotency_key" IS NOT NULL AND "request_digest" ~ '^[0-9a-f]{64}$')
    )
);

CREATE UNIQUE INDEX "order_timeline_events_order_id_order_version_key"
ON "order_timeline_events"("order_id", "order_version");
CREATE UNIQUE INDEX "order_timeline_events_order_id_idempotency_key_key"
ON "order_timeline_events"("order_id", "idempotency_key");
CREATE INDEX "order_timeline_events_order_id_occurred_at_id_idx"
ON "order_timeline_events"("order_id", "occurred_at", "id");
CREATE INDEX "order_timeline_events_actor_user_id_occurred_at_id_idx"
ON "order_timeline_events"("actor_user_id", "occurred_at", "id");
CREATE INDEX "shop_orders_status_created_at_id_idx"
ON "shop_orders"("status", "created_at" DESC, "id" DESC);
CREATE INDEX "shop_orders_created_at_id_idx"
ON "shop_orders"("created_at" DESC, "id" DESC);

ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The order UUID is also a deterministic UUID for its one version-zero creation event.
INSERT INTO "order_timeline_events" (
    "id", "order_id", "previous_status", "status", "order_version", "actor_type",
    "actor_user_id", "reason_code", "reason_note", "idempotency_key", "request_digest", "occurred_at"
)
SELECT
    "id", "id", NULL, 'pending_confirmation', 0, 'system',
    NULL, 'ORDER_CREATED', NULL, NULL, NULL, "created_at"
FROM "shop_orders"
ON CONFLICT ("order_id", "order_version") DO NOTHING;
