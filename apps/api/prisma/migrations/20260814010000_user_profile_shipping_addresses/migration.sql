ALTER TABLE "users"
ADD COLUMN "phone_number" VARCHAR(10);

ALTER TABLE "users"
ADD CONSTRAINT "users_phone_number_format"
CHECK ("phone_number" IS NULL OR "phone_number" ~ '^0[0-9]{9}$');

CREATE TABLE "shipping_addresses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "recipient_name" VARCHAR(120) NOT NULL,
  "phone_number" VARCHAR(10) NOT NULL,
  "province" VARCHAR(100) NOT NULL,
  "district" VARCHAR(100) NOT NULL,
  "ward" VARCHAR(100) NOT NULL,
  "address_line" VARCHAR(255) NOT NULL,
  "label" VARCHAR(50),
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),

  CONSTRAINT "shipping_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipping_addresses_phone_number_format"
    CHECK ("phone_number" ~ '^0[0-9]{9}$'),
  CONSTRAINT "shipping_addresses_recipient_name_bounded"
    CHECK (
      char_length("recipient_name") BETWEEN 2 AND 120
      AND "recipient_name" = btrim("recipient_name")
      AND "recipient_name" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "shipping_addresses_province_bounded"
    CHECK (
      char_length("province") BETWEEN 2 AND 100
      AND "province" = btrim("province")
      AND "province" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "shipping_addresses_district_bounded"
    CHECK (
      char_length("district") BETWEEN 2 AND 100
      AND "district" = btrim("district")
      AND "district" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "shipping_addresses_ward_bounded"
    CHECK (
      char_length("ward") BETWEEN 2 AND 100
      AND "ward" = btrim("ward")
      AND "ward" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "shipping_addresses_address_line_bounded"
    CHECK (
      char_length("address_line") BETWEEN 5 AND 255
      AND "address_line" = btrim("address_line")
      AND "address_line" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "shipping_addresses_label_bounded"
    CHECK (
      "label" IS NULL
      OR (
        char_length("label") BETWEEN 1 AND 50
        AND "label" = btrim("label")
        AND "label" !~ '[[:cntrl:]]'
      )
    ),
  CONSTRAINT "shipping_addresses_deleted_not_default"
    CHECK ("deleted_at" IS NULL OR "is_default" = false),
  CONSTRAINT "shipping_addresses_valid_timestamps"
    CHECK ("updated_at" >= "created_at" AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")),
  CONSTRAINT "shipping_addresses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shipping_addresses_user_id_deleted_at_is_default_created_at_id_idx"
ON "shipping_addresses"("user_id", "deleted_at", "is_default", "created_at", "id");

CREATE INDEX "shipping_addresses_deleted_at_idx"
ON "shipping_addresses"("deleted_at");

CREATE INDEX "shipping_addresses_active_order_idx"
ON "shipping_addresses"("user_id", "is_default" DESC, "created_at" ASC, "id" ASC)
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "shipping_addresses_one_active_default_per_user"
ON "shipping_addresses"("user_id")
WHERE "is_default" = true AND "deleted_at" IS NULL;
