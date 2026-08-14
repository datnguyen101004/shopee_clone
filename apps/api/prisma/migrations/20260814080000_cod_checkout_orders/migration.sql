CREATE TYPE "purchase_payment_method" AS ENUM ('cod');
CREATE TYPE "purchase_payment_status" AS ENUM ('unpaid');
CREATE TYPE "shop_order_status" AS ENUM ('pending_confirmation');
CREATE TYPE "purchase_voucher_slot" AS ENUM ('platform', 'shop', 'free_shipping');
CREATE TYPE "voucher_allocation_kind" AS ENUM ('merchandise', 'shipping');

CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "checkout_fingerprint" CHAR(64) NOT NULL,
    "source_cart_version" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "payment_method" "purchase_payment_method" NOT NULL DEFAULT 'cod',
    "payment_status" "purchase_payment_status" NOT NULL DEFAULT 'unpaid',
    "address_snapshot" JSONB NOT NULL,
    "list_subtotal_minor" BIGINT NOT NULL,
    "product_discount_minor" BIGINT NOT NULL,
    "merchandise_subtotal_minor" BIGINT NOT NULL,
    "shipping_total_minor" BIGINT NOT NULL,
    "shop_voucher_discount_minor" BIGINT NOT NULL,
    "platform_voucher_discount_minor" BIGINT NOT NULL,
    "merchandise_voucher_discount_minor" BIGINT NOT NULL,
    "shipping_voucher_discount_minor" BIGINT NOT NULL,
    "voucher_discount_minor" BIGINT NOT NULL,
    "shipping_payable_minor" BIGINT NOT NULL,
    "payable_total_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchases_digest_check" CHECK (
        "request_digest" ~ '^[0-9a-f]{64}$' AND
        "checkout_fingerprint" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "purchases_source_cart_version_check" CHECK ("source_cart_version" >= 0),
    CONSTRAINT "purchases_currency_check" CHECK ("currency" = 'VND'),
    CONSTRAINT "purchases_address_snapshot_check" CHECK (jsonb_typeof("address_snapshot") = 'object'),
    CONSTRAINT "purchases_amounts_check" CHECK (
        "list_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "product_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_total_minor" BETWEEN 0 AND 9007199254740991 AND
        "shop_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "platform_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_payable_minor" BETWEEN 0 AND 9007199254740991 AND
        "payable_total_minor" BETWEEN 0 AND 9007199254740991 AND
        "list_subtotal_minor" - "merchandise_subtotal_minor" = "product_discount_minor" AND
        "shop_voucher_discount_minor" + "platform_voucher_discount_minor" = "merchandise_voucher_discount_minor" AND
        "merchandise_voucher_discount_minor" + "shipping_voucher_discount_minor" = "voucher_discount_minor" AND
        "shipping_total_minor" - "shipping_voucher_discount_minor" = "shipping_payable_minor" AND
        "merchandise_subtotal_minor" - "merchandise_voucher_discount_minor" + "shipping_payable_minor" = "payable_total_minor"
    )
);

CREATE TABLE "shop_orders" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "status" "shop_order_status" NOT NULL DEFAULT 'pending_confirmation',
    "payment_status" "purchase_payment_status" NOT NULL DEFAULT 'unpaid',
    "shop_snapshot" JSONB NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "shipping_snapshot" JSONB NOT NULL,
    "list_subtotal_minor" BIGINT NOT NULL,
    "product_discount_minor" BIGINT NOT NULL,
    "merchandise_subtotal_minor" BIGINT NOT NULL,
    "shop_voucher_discount_minor" BIGINT NOT NULL,
    "platform_voucher_discount_minor" BIGINT NOT NULL,
    "merchandise_voucher_discount_minor" BIGINT NOT NULL,
    "shipping_voucher_discount_minor" BIGINT NOT NULL,
    "voucher_discount_minor" BIGINT NOT NULL,
    "shipping_payable_minor" BIGINT NOT NULL,
    "payable_total_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shop_orders_snapshots_check" CHECK (
        jsonb_typeof("shop_snapshot") = 'object' AND
        jsonb_typeof("shipping_snapshot") = 'object'
    ),
    CONSTRAINT "shop_orders_note_check" CHECK ("note" !~ '[[:cntrl:]]'),
    CONSTRAINT "shop_orders_amounts_check" CHECK (
        "list_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "product_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "shop_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "platform_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_payable_minor" BETWEEN 0 AND 9007199254740991 AND
        "payable_total_minor" BETWEEN 0 AND 9007199254740991 AND
        "list_subtotal_minor" - "merchandise_subtotal_minor" = "product_discount_minor" AND
        "shop_voucher_discount_minor" + "platform_voucher_discount_minor" = "merchandise_voucher_discount_minor" AND
        "merchandise_voucher_discount_minor" + "shipping_voucher_discount_minor" = "voucher_discount_minor" AND
        "merchandise_subtotal_minor" - "merchandise_voucher_discount_minor" + "shipping_payable_minor" = "payable_total_minor"
    )
);

CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "source_cart_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name" VARCHAR(240) NOT NULL,
    "product_image_url" TEXT,
    "variant_name" VARCHAR(160) NOT NULL,
    "variant_sku" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_weight_grams" INTEGER NOT NULL,
    "shipment_weight_grams" INTEGER NOT NULL,
    "list_unit_price_minor" BIGINT NOT NULL,
    "selling_unit_price_minor" BIGINT NOT NULL,
    "list_subtotal_minor" BIGINT NOT NULL,
    "product_discount_minor" BIGINT NOT NULL,
    "merchandise_subtotal_minor" BIGINT NOT NULL,
    "shop_voucher_discount_minor" BIGINT NOT NULL,
    "platform_voucher_discount_minor" BIGINT NOT NULL,
    "merchandise_voucher_discount_minor" BIGINT NOT NULL,
    "payable_merchandise_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_lines_text_check" CHECK (
        btrim("product_name") <> '' AND btrim("variant_name") <> '' AND btrim("variant_sku") <> ''
    ),
    CONSTRAINT "order_lines_quantity_weight_check" CHECK (
        "quantity" > 0 AND "unit_weight_grams" > 0 AND
        "shipment_weight_grams" = "unit_weight_grams" * "quantity"
    ),
    CONSTRAINT "order_lines_amounts_check" CHECK (
        "list_unit_price_minor" BETWEEN 0 AND 9007199254740991 AND
        "selling_unit_price_minor" BETWEEN 0 AND 9007199254740991 AND
        "list_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "product_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_subtotal_minor" BETWEEN 0 AND 9007199254740991 AND
        "shop_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "platform_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "merchandise_voucher_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "payable_merchandise_minor" BETWEEN 0 AND 9007199254740991 AND
        "list_unit_price_minor" >= "selling_unit_price_minor" AND
        "list_subtotal_minor" = "list_unit_price_minor" * "quantity" AND
        "merchandise_subtotal_minor" = "selling_unit_price_minor" * "quantity" AND
        "list_subtotal_minor" - "merchandise_subtotal_minor" = "product_discount_minor" AND
        "shop_voucher_discount_minor" + "platform_voucher_discount_minor" = "merchandise_voucher_discount_minor" AND
        "merchandise_subtotal_minor" - "merchandise_voucher_discount_minor" = "payable_merchandise_minor"
    )
);

CREATE TABLE "purchase_vouchers" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "shop_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "issuer" "voucher_issuer" NOT NULL,
    "benefit_type" "voucher_benefit_type" NOT NULL,
    "slot" "purchase_voucher_slot" NOT NULL,
    "merchandise_discount_minor" BIGINT NOT NULL,
    "shipping_discount_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_vouchers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_vouchers_code_name_check" CHECK (
        "code" ~ '^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$' AND btrim("name") <> ''
    ),
    CONSTRAINT "purchase_vouchers_slot_check" CHECK (
        ("slot" = 'shop' AND "shop_id" IS NOT NULL AND "issuer" = 'shop') OR
        ("slot" IN ('platform', 'free_shipping') AND "shop_id" IS NULL AND "issuer" = 'platform')
    ),
    CONSTRAINT "purchase_vouchers_benefit_check" CHECK (
        ("slot" = 'free_shipping' AND "benefit_type" = 'free_shipping' AND "merchandise_discount_minor" = 0) OR
        ("slot" IN ('platform', 'shop') AND "benefit_type" <> 'free_shipping' AND "shipping_discount_minor" = 0)
    ),
    CONSTRAINT "purchase_vouchers_amounts_check" CHECK (
        "merchandise_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "discount_minor" BETWEEN 1 AND 9007199254740991 AND
        "merchandise_discount_minor" + "shipping_discount_minor" = "discount_minor"
    )
);

CREATE TABLE "purchase_voucher_allocations" (
    "id" UUID NOT NULL,
    "purchase_voucher_id" UUID NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "order_line_id" UUID,
    "kind" "voucher_allocation_kind" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_voucher_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_voucher_allocations_shape_check" CHECK (
        ("kind" = 'merchandise' AND "order_line_id" IS NOT NULL) OR
        ("kind" = 'shipping' AND "order_line_id" IS NULL)
    ),
    CONSTRAINT "purchase_voucher_allocations_amount_check" CHECK (
        "amount_minor" BETWEEN 1 AND 9007199254740991
    )
);

CREATE UNIQUE INDEX "purchases_buyer_id_idempotency_key_key" ON "purchases"("buyer_id", "idempotency_key");
CREATE INDEX "purchases_buyer_id_created_at_id_idx" ON "purchases"("buyer_id", "created_at" DESC, "id");
CREATE INDEX "purchases_created_at_id_idx" ON "purchases"("created_at", "id");
CREATE UNIQUE INDEX "shop_orders_purchase_id_shop_id_key" ON "shop_orders"("purchase_id", "shop_id");
CREATE INDEX "shop_orders_shop_id_created_at_id_idx" ON "shop_orders"("shop_id", "created_at" DESC, "id");
CREATE INDEX "shop_orders_purchase_id_id_idx" ON "shop_orders"("purchase_id", "id");
CREATE UNIQUE INDEX "order_lines_order_id_source_cart_line_id_key" ON "order_lines"("order_id", "source_cart_line_id");
CREATE INDEX "order_lines_product_id_created_at_id_idx" ON "order_lines"("product_id", "created_at", "id");
CREATE INDEX "order_lines_variant_id_created_at_id_idx" ON "order_lines"("variant_id", "created_at", "id");
CREATE INDEX "order_lines_source_cart_line_id_idx" ON "order_lines"("source_cart_line_id");
CREATE UNIQUE INDEX "purchase_vouchers_purchase_id_voucher_id_key" ON "purchase_vouchers"("purchase_id", "voucher_id");
CREATE INDEX "purchase_vouchers_voucher_id_created_at_id_idx" ON "purchase_vouchers"("voucher_id", "created_at", "id");
CREATE INDEX "purchase_vouchers_shop_id_created_at_id_idx" ON "purchase_vouchers"("shop_id", "created_at", "id");
CREATE UNIQUE INDEX "purchase_voucher_allocations_business_key" ON "purchase_voucher_allocations"(
    "purchase_voucher_id",
    "shop_order_id",
    COALESCE("order_line_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "kind"
);
CREATE INDEX "purchase_voucher_allocations_purchase_voucher_id_shop_order_id_order_line_id_idx" ON "purchase_voucher_allocations"("purchase_voucher_id", "shop_order_id", "order_line_id");
CREATE INDEX "purchase_voucher_allocations_shop_order_id_created_at_id_idx" ON "purchase_voucher_allocations"("shop_order_id", "created_at", "id");
CREATE INDEX "purchase_voucher_allocations_order_line_id_idx" ON "purchase_voucher_allocations"("order_line_id");

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_fkey"
FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_voucher_id_fkey"
FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_vouchers" ADD CONSTRAINT "purchase_vouchers_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_voucher_allocations" ADD CONSTRAINT "purchase_voucher_allocations_purchase_voucher_id_fkey"
FOREIGN KEY ("purchase_voucher_id") REFERENCES "purchase_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_voucher_allocations" ADD CONSTRAINT "purchase_voucher_allocations_shop_order_id_fkey"
FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_voucher_allocations" ADD CONSTRAINT "purchase_voucher_allocations_order_line_id_fkey"
FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- T18 used two audit-shaped seed fixtures before a purchase table existed. They are
-- not buyer purchases and must not be promoted into historical orders.
DELETE FROM "voucher_redemptions"
WHERE "consumption_id" IN (
    '00000000-0000-4000-8000-000000001101'::uuid,
    '00000000-0000-4000-8000-000000001102'::uuid
);
DELETE FROM "voucher_consumptions"
WHERE "id" IN (
    '00000000-0000-4000-8000-000000001101'::uuid,
    '00000000-0000-4000-8000-000000001102'::uuid
);

ALTER TABLE "voucher_consumptions" ADD CONSTRAINT "voucher_consumptions_purchase_reference_fkey"
FOREIGN KEY ("purchase_reference") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
