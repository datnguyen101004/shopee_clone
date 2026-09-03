-- T30 notification inbox, preferences, delivery outbox, and email templates.
CREATE TYPE "notification_category" AS ENUM ('orders', 'promotions', 'account', 'system');
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email');
CREATE TYPE "notification_type" AS ENUM (
  'order_confirmed',
  'order_shipping',
  'order_delivered',
  'order_cancelled',
  'return_requested',
  'return_accepted',
  'dispute_escalated',
  'refunded',
  'product_approved',
  'product_rejected',
  'voucher_assigned',
  'system_notice'
);
CREATE TYPE "notification_delivery_status" AS ENUM ('pending', 'delivered', 'failed');

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipient_id" UUID NOT NULL,
  "category" "notification_category" NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "metadata" JSONB NOT NULL,
  "deduplication_key" VARCHAR(240) NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMPTZ(3),
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_deduplication_key_key" UNIQUE ("deduplication_key"),
  CONSTRAINT "notifications_title_check" CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "notifications_body_check" CHECK (char_length(btrim("body")) > 0),
  CONSTRAINT "notifications_dedupe_check" CHECK (char_length(btrim("deduplication_key")) > 0),
  CONSTRAINT "notifications_read_consistency_check" CHECK (
    ("is_read" = false AND "read_at" IS NULL) OR ("is_read" = true AND "read_at" IS NOT NULL)
  )
);

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "category" "notification_category" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_user_category_channel_key" UNIQUE ("user_id", "category", "channel")
);

CREATE TABLE "notification_delivery_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" UUID NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "status" "notification_delivery_status" NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(500),
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_delivery_attempts_notification_channel_key" UNIQUE ("notification_id", "channel"),
  CONSTRAINT "notification_delivery_attempts_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE TABLE "notification_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "notification_type" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "locale" VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "subject" VARCHAR(200) NOT NULL,
  "html_body" TEXT NOT NULL,
  "text_body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_templates_type_channel_locale_version_key" UNIQUE ("type", "channel", "locale", "version"),
  CONSTRAINT "notification_templates_version_check" CHECK ("version" > 0),
  CONSTRAINT "notification_templates_subject_check" CHECK (char_length(btrim("subject")) > 0)
);

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts"
  ADD CONSTRAINT "notification_delivery_attempts_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notifications_recipient_archived_created_idx"
  ON "notifications"("recipient_id", "is_archived", "created_at" DESC, "id");
CREATE INDEX "notifications_recipient_unread_idx"
  ON "notifications"("recipient_id", "is_read", "is_archived");
CREATE INDEX "notifications_recipient_category_archived_created_idx"
  ON "notifications"("recipient_id", "category", "is_archived", "created_at" DESC, "id");

CREATE INDEX "notification_preferences_user_id_idx"
  ON "notification_preferences"("user_id");

CREATE INDEX "notification_delivery_attempts_status_retry_idx"
  ON "notification_delivery_attempts"("status", "next_retry_at", "created_at", "id");
CREATE INDEX "notification_delivery_attempts_notification_id_idx"
  ON "notification_delivery_attempts"("notification_id");
