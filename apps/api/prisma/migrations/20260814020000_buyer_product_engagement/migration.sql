-- Additive buyer-product relationships; existing users and products require no backfill.
CREATE TABLE "product_favorites" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "favorited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_favorites_pkey" PRIMARY KEY ("user_id", "product_id")
);

CREATE TABLE "recently_viewed_products" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "last_viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_products_pkey" PRIMARY KEY ("user_id", "product_id")
);

CREATE INDEX "product_favorites_user_id_favorited_at_product_id_idx"
ON "product_favorites"("user_id", "favorited_at" DESC, "product_id");

CREATE INDEX "product_favorites_product_id_idx"
ON "product_favorites"("product_id");

CREATE INDEX "recently_viewed_products_user_id_last_viewed_at_product_idx"
ON "recently_viewed_products"("user_id", "last_viewed_at" DESC, "product_id");

CREATE INDEX "recently_viewed_products_product_id_idx"
ON "recently_viewed_products"("product_id");

ALTER TABLE "product_favorites"
ADD CONSTRAINT "product_favorites_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_favorites"
ADD CONSTRAINT "product_favorites_product_id_fkey" FOREIGN KEY ("product_id")
REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recently_viewed_products"
ADD CONSTRAINT "recently_viewed_products_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recently_viewed_products"
ADD CONSTRAINT "recently_viewed_products_product_id_fkey" FOREIGN KEY ("product_id")
REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
