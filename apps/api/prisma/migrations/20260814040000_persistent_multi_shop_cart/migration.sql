-- Additive, server-authoritative guest and authenticated cart persistence.
ALTER TABLE "product_variants"
ADD COLUMN "max_purchase_quantity" INTEGER;

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_max_purchase_quantity_check"
CHECK ("max_purchase_quantity" IS NULL OR "max_purchase_quantity" BETWEEN 1 AND 99);

CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "guest_credential_digest" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "merged_into_cart_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "carts_version_check" CHECK ("version" >= 0),
    CONSTRAINT "carts_owner_xor_check" CHECK (
        ("user_id" IS NOT NULL AND "guest_credential_digest" IS NULL AND "expires_at" IS NULL AND "consumed_at" IS NULL AND "merged_into_cart_id" IS NULL)
        OR
        ("user_id" IS NULL AND "guest_credential_digest" IS NOT NULL AND "expires_at" IS NOT NULL)
    ),
    CONSTRAINT "carts_merge_lifecycle_check" CHECK (
        ("consumed_at" IS NULL AND "merged_into_cart_id" IS NULL)
        OR
        ("consumed_at" IS NOT NULL AND "merged_into_cart_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");
CREATE UNIQUE INDEX "carts_guest_credential_digest_key" ON "carts"("guest_credential_digest");
CREATE INDEX "carts_expires_at_consumed_at_idx" ON "carts"("expires_at", "consumed_at");
CREATE INDEX "carts_merged_into_cart_id_idx" ON "carts"("merged_into_cart_id");

CREATE TABLE "cart_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "last_observed_unit_price_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cart_lines_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99),
    CONSTRAINT "cart_lines_observed_price_check" CHECK ("last_observed_unit_price_minor" >= 0)
);

CREATE UNIQUE INDEX "cart_lines_cart_id_variant_id_key"
ON "cart_lines"("cart_id", "variant_id");
CREATE INDEX "cart_lines_cart_id_created_at_id_idx"
ON "cart_lines"("cart_id", "created_at", "id");
CREATE INDEX "cart_lines_variant_id_idx" ON "cart_lines"("variant_id");

ALTER TABLE "carts"
ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carts"
ADD CONSTRAINT "carts_merged_into_cart_id_fkey" FOREIGN KEY ("merged_into_cart_id")
REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cart_lines"
ADD CONSTRAINT "cart_lines_cart_id_fkey" FOREIGN KEY ("cart_id")
REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_lines"
ADD CONSTRAINT "cart_lines_variant_id_fkey" FOREIGN KEY ("variant_id")
REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
