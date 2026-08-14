CREATE TYPE "voucher_issuer" AS ENUM ('platform', 'shop');
CREATE TYPE "voucher_benefit_type" AS ENUM ('fixed_amount', 'percentage', 'free_shipping');

CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "issuer" "voucher_issuer" NOT NULL,
    "shop_id" UUID,
    "benefit_type" "voucher_benefit_type" NOT NULL,
    "fixed_amount_minor" BIGINT,
    "percentage_basis_points" INTEGER,
    "maximum_discount_minor" BIGINT,
    "minimum_spend_minor" BIGINT NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "usage_limit" INTEGER NOT NULL,
    "per_buyer_limit" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vouchers_code_format_check" CHECK (
        "code" ~ '^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$'
    ),
    CONSTRAINT "vouchers_name_nonempty_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "vouchers_issuer_shop_check" CHECK (
        ("issuer" = 'platform' AND "shop_id" IS NULL) OR
        ("issuer" = 'shop' AND "shop_id" IS NOT NULL)
    ),
    CONSTRAINT "vouchers_benefit_configuration_check" CHECK (
        ("benefit_type" = 'fixed_amount' AND "fixed_amount_minor" BETWEEN 1 AND 9007199254740991 AND "percentage_basis_points" IS NULL AND "maximum_discount_minor" IS NULL) OR
        ("benefit_type" = 'percentage' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" BETWEEN 1 AND 10000 AND "maximum_discount_minor" BETWEEN 1 AND 9007199254740991) OR
        ("benefit_type" = 'free_shipping' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" IS NULL AND "maximum_discount_minor" BETWEEN 1 AND 9007199254740991)
    ),
    CONSTRAINT "vouchers_minimum_spend_check" CHECK (
        "minimum_spend_minor" BETWEEN 0 AND 9007199254740991
    ),
    CONSTRAINT "vouchers_activity_window_check" CHECK ("starts_at" < "ends_at"),
    CONSTRAINT "vouchers_usage_limits_check" CHECK (
        "usage_limit" > 0 AND
        "per_buyer_limit" > 0 AND
        "per_buyer_limit" <= "usage_limit" AND
        "used_count" BETWEEN 0 AND "usage_limit"
    )
);

CREATE TABLE "voucher_product_scopes" (
    "voucher_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "voucher_product_scopes_pkey" PRIMARY KEY ("voucher_id", "product_id")
);

CREATE TABLE "voucher_user_usages" (
    "voucher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_user_usages_pkey" PRIMARY KEY ("voucher_id", "user_id"),
    CONSTRAINT "voucher_user_usages_count_check" CHECK ("used_count" >= 0)
);

CREATE TABLE "voucher_consumptions" (
    "id" UUID NOT NULL,
    "purchase_reference" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "voucher_set_digest" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_consumptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voucher_consumptions_digest_check" CHECK (
        "voucher_set_digest" ~ '^[0-9a-f]{64}$'
    )
);

CREATE TABLE "voucher_redemptions" (
    "id" UUID NOT NULL,
    "consumption_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchandise_discount_minor" BIGINT NOT NULL,
    "shipping_discount_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voucher_redemptions_amounts_check" CHECK (
        "merchandise_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "shipping_discount_minor" BETWEEN 0 AND 9007199254740991 AND
        "discount_minor" BETWEEN 1 AND 9007199254740991 AND
        "discount_minor" = "merchandise_discount_minor" + "shipping_discount_minor"
    )
);

CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");
CREATE INDEX "vouchers_shop_id_is_enabled_starts_at_ends_at_idx" ON "vouchers"("shop_id", "is_enabled", "starts_at", "ends_at");
CREATE INDEX "vouchers_is_enabled_starts_at_ends_at_idx" ON "vouchers"("is_enabled", "starts_at", "ends_at");
CREATE INDEX "voucher_product_scopes_product_id_voucher_id_idx" ON "voucher_product_scopes"("product_id", "voucher_id");
CREATE INDEX "voucher_user_usages_user_id_voucher_id_idx" ON "voucher_user_usages"("user_id", "voucher_id");
CREATE UNIQUE INDEX "voucher_consumptions_purchase_reference_key" ON "voucher_consumptions"("purchase_reference");
CREATE INDEX "voucher_consumptions_user_id_created_at_id_idx" ON "voucher_consumptions"("user_id", "created_at", "id");
CREATE UNIQUE INDEX "voucher_redemptions_consumption_id_voucher_id_key" ON "voucher_redemptions"("consumption_id", "voucher_id");
CREATE INDEX "voucher_redemptions_voucher_id_created_at_id_idx" ON "voucher_redemptions"("voucher_id", "created_at", "id");
CREATE INDEX "voucher_redemptions_user_id_created_at_id_idx" ON "voucher_redemptions"("user_id", "created_at", "id");

ALTER TABLE "vouchers"
ADD CONSTRAINT "vouchers_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_product_scopes"
ADD CONSTRAINT "voucher_product_scopes_voucher_id_fkey"
FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voucher_product_scopes"
ADD CONSTRAINT "voucher_product_scopes_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_user_usages"
ADD CONSTRAINT "voucher_user_usages_voucher_id_fkey"
FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_user_usages"
ADD CONSTRAINT "voucher_user_usages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_consumptions"
ADD CONSTRAINT "voucher_consumptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_redemptions"
ADD CONSTRAINT "voucher_redemptions_consumption_id_fkey"
FOREIGN KEY ("consumption_id") REFERENCES "voucher_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_redemptions"
ADD CONSTRAINT "voucher_redemptions_voucher_id_fkey"
FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voucher_redemptions"
ADD CONSTRAINT "voucher_redemptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
