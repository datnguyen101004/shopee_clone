-- Additive buyer-shop following; existing users and shops require no backfill.
CREATE TABLE "shop_followers" (
    "user_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "followed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_followers_pkey" PRIMARY KEY ("user_id", "shop_id")
);

CREATE INDEX "shop_followers_shop_id_followed_at_user_id_idx"
ON "shop_followers"("shop_id", "followed_at" DESC, "user_id");

CREATE INDEX "shop_followers_user_id_followed_at_shop_id_idx"
ON "shop_followers"("user_id", "followed_at" DESC, "shop_id");

ALTER TABLE "shop_followers"
ADD CONSTRAINT "shop_followers_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shop_followers"
ADD CONSTRAINT "shop_followers_shop_id_fkey" FOREIGN KEY ("shop_id")
REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
