CREATE TYPE "inventory_adjustment_reason" AS ENUM ('initial_stock', 'product_edit', 'restock', 'damage', 'return', 'correction');
CREATE TYPE "inventory_reservation_status" AS ENUM ('active', 'consumed', 'released', 'expired');

ALTER TABLE "inventory"
  ADD COLUMN "quantity_sold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_sold_nonnegative" CHECK ("quantity_sold" >= 0);

CREATE TABLE "inventory_adjustments" (
  "id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "reason" "inventory_adjustment_reason" NOT NULL,
  "note" VARCHAR(500),
  "delta" INTEGER NOT NULL,
  "quantity_on_hand_before" INTEGER NOT NULL,
  "quantity_on_hand_after" INTEGER NOT NULL,
  "quantity_reserved" INTEGER NOT NULL,
  "quantity_sold" INTEGER NOT NULL,
  "inventory_version" INTEGER NOT NULL,
  "idempotency_key" UUID,
  "request_digest" CHAR(64),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_adjustments_inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_adjustments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_adjustments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_adjustments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_adjustments_delta_check" CHECK ("delta" <> 0),
  CONSTRAINT "inventory_adjustments_digest_check" CHECK ("request_digest" IS NULL OR "request_digest" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "inventory_adjustments_variant_id_occurred_at_id_idx" ON "inventory_adjustments"("variant_id", "occurred_at" DESC, "id");
CREATE INDEX "inventory_adjustments_shop_id_occurred_at_id_idx" ON "inventory_adjustments"("shop_id", "occurred_at" DESC, "id");
CREATE INDEX "inventory_adjustments_idempotency_key_idx" ON "inventory_adjustments"("idempotency_key");
CREATE UNIQUE INDEX "inventory_adjustments_variant_id_idempotency_key_key" ON "inventory_adjustments"("variant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE "inventory_reservations" (
  "id" UUID NOT NULL,
  "buyer_id" UUID NOT NULL,
  "cart_version" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "generation_token" UUID NOT NULL,
  "status" "inventory_reservation_status" NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "purchase_id" UUID,
  "terminal_reason" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMPTZ(3),
  "released_at" TIMESTAMPTZ(3),
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_generation_token_key" UNIQUE ("generation_token"),
  CONSTRAINT "inventory_reservations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_cart_version_check" CHECK ("cart_version" >= 0),
  CONSTRAINT "inventory_reservations_digest_check" CHECK ("request_digest" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "inventory_reservations_buyer_id_idempotency_key_status_idx" ON "inventory_reservations"("buyer_id", "idempotency_key", "status");
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");
CREATE UNIQUE INDEX "inventory_reservations_live_idempotency_key_key" ON "inventory_reservations"("buyer_id", "idempotency_key") WHERE "status" IN ('active', 'consumed');

CREATE TABLE "inventory_reservation_lines" (
  "id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_reservation_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_lines_quantity_check" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "inventory_reservation_lines_reservation_id_variant_id_key" ON "inventory_reservation_lines"("reservation_id", "variant_id");
CREATE INDEX "inventory_reservation_lines_variant_id_created_at_idx" ON "inventory_reservation_lines"("variant_id", "created_at");

-- Existing inventory is the authoritative opening balance. Record it as an immutable audit event.
INSERT INTO "inventory_adjustments" (
  "id", "variant_id", "shop_id", "reason", "delta",
  "quantity_on_hand_before", "quantity_on_hand_after", "quantity_reserved", "quantity_sold", "inventory_version"
)
SELECT gen_random_uuid(), i."variant_id", v."shop_id", 'initial_stock', i."quantity_on_hand",
       0, i."quantity_on_hand", i."quantity_reserved", i."quantity_sold", i."version"
FROM "inventory" i
JOIN "product_variants" v ON v."id" = i."variant_id"
WHERE i."quantity_on_hand" <> 0;
