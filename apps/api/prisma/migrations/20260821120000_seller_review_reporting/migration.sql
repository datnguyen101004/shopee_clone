CREATE TYPE "seller_review_report_reason" AS ENUM (
  'abusive_content',
  'irrelevant_content',
  'spam_or_fraud',
  'other'
);

CREATE TYPE "seller_review_report_status" AS ENUM ('open', 'resolved');

CREATE TABLE "seller_review_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "review_id" UUID NOT NULL,
  "seller_user_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "reason_code" "seller_review_report_reason" NOT NULL,
  "details" VARCHAR(1000),
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "status" "seller_review_report_status" NOT NULL DEFAULT 'open',
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_review_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_review_reports_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_review_reports_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seller_review_reports_seller_user_id_idempotency_key_key" UNIQUE ("seller_user_id", "idempotency_key")
);

CREATE UNIQUE INDEX "seller_review_reports_open_seller_review_key"
  ON "seller_review_reports" ("seller_user_id", "review_id")
  WHERE "status" = 'open';

CREATE INDEX "seller_review_reports_review_status_created_id_idx"
  ON "seller_review_reports" ("review_id", "status", "created_at" DESC, "id");

CREATE INDEX "seller_review_reports_shop_seller_created_id_idx"
  ON "seller_review_reports" ("shop_id", "seller_user_id", "created_at" DESC, "id");
