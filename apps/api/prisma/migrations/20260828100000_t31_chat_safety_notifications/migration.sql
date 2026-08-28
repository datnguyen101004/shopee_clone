-- T31 Change 3: chat safety, moderation and low-noise notifications.
-- All changes are additive and preserve existing chat/notification rows.

ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'chat_conversation';
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'chat_message';
ALTER TYPE "moderation_case_outcome" ADD VALUE IF NOT EXISTS 'warn_user';
ALTER TYPE "moderation_case_outcome" ADD VALUE IF NOT EXISTS 'restrict_chat_temporary';
ALTER TYPE "moderation_case_outcome" ADD VALUE IF NOT EXISTS 'restrict_chat_indefinite';
ALTER TYPE "moderation_case_outcome" ADD VALUE IF NOT EXISTS 'restore_chat';
ALTER TYPE "notification_category" ADD VALUE IF NOT EXISTS 'chat';

CREATE TYPE "chat_rate_limit_scope" AS ENUM ('account', 'source');

ALTER TABLE "chat_user_memberships"
  ADD COLUMN IF NOT EXISTS "notifications_muted_at" TIMESTAMPTZ(3);

ALTER TABLE "chat_user_messages"
  ADD COLUMN IF NOT EXISTS "reply_to_message_id" UUID;

ALTER TABLE "user_reports"
  ADD COLUMN IF NOT EXISTS "chat_conversation_id" UUID,
  ADD COLUMN IF NOT EXISTS "chat_message_id" UUID,
  ADD COLUMN IF NOT EXISTS "reported_user_id" UUID;

ALTER TABLE "moderation_cases"
  ADD COLUMN IF NOT EXISTS "chat_conversation_id" UUID,
  ADD COLUMN IF NOT EXISTS "reported_user_id" UUID;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "activity_at" TIMESTAMPTZ(3);
UPDATE "notifications" SET "activity_at" = "created_at" WHERE "activity_at" IS NULL;
ALTER TABLE "notifications" ALTER COLUMN "activity_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "notifications" ALTER COLUMN "activity_at" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "chat_user_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blocker_user_id" UUID NOT NULL,
  "blocked_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_user_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_user_blocks_distinct_check" CHECK ("blocker_user_id" <> "blocked_user_id"),
  CONSTRAINT "chat_user_blocks_blocker_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_user_blocks_blocked_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_user_blocks_pair_key" ON "chat_user_blocks" ("blocker_user_id", "blocked_user_id");
CREATE INDEX IF NOT EXISTS "chat_user_blocks_blocked_created_idx" ON "chat_user_blocks" ("blocked_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "chat_rate_limit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" "chat_rate_limit_scope" NOT NULL,
  "subject_hash" CHAR(64) NOT NULL,
  "user_id" UUID,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_rate_limit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_rate_limit_events_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "chat_rate_limit_events_scope_subject_attempted_idx" ON "chat_rate_limit_events" ("scope", "subject_hash", "attempted_at" DESC);
CREATE INDEX IF NOT EXISTS "chat_rate_limit_events_attempted_idx" ON "chat_rate_limit_events" ("attempted_at");
ALTER TABLE "chat_rate_limit_events"
  ADD CONSTRAINT "chat_rate_limit_events_scope_subject_check" CHECK (
    ("scope" = 'account' AND "user_id" IS NOT NULL) OR
    ("scope" = 'source' AND "user_id" IS NULL)
  );

CREATE TABLE IF NOT EXISTS "chat_attention_leases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "client_instance_id" VARCHAR(80) NOT NULL,
  "conversation_id" UUID NOT NULL,
  "at_newest_region" BOOLEAN NOT NULL,
  "engaged_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_attention_leases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_attention_leases_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_attention_leases_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "chat_attention_leases_identity_key" ON "chat_attention_leases" ("user_id", "session_id", "client_instance_id", "conversation_id");
CREATE INDEX IF NOT EXISTS "chat_attention_leases_conversation_expiry_idx" ON "chat_attention_leases" ("conversation_id", "user_id", "expires_at");
CREATE INDEX IF NOT EXISTS "chat_attention_leases_expiry_idx" ON "chat_attention_leases" ("expires_at");
ALTER TABLE "chat_attention_leases"
  ADD CONSTRAINT "chat_attention_leases_expiry_check" CHECK ("expires_at" > "engaged_at");

CREATE TABLE IF NOT EXISTS "user_chat_restrictions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "restricted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restricted_until" TIMESTAMPTZ(3),
  "originating_decision_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "restored_at" TIMESTAMPTZ(3),
  CONSTRAINT "user_chat_restrictions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_chat_restrictions_user_key" UNIQUE ("user_id"),
  CONSTRAINT "user_chat_restrictions_originating_decision_key" UNIQUE ("originating_decision_id"),
  CONSTRAINT "user_chat_restrictions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_chat_restrictions_decision_fkey" FOREIGN KEY ("originating_decision_id") REFERENCES "moderation_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_chat_restrictions_until_idx" ON "user_chat_restrictions" ("restricted_until");

-- Replace the old product/shop-only target shape with an additive four-way shape.
ALTER TABLE "user_reports" DROP CONSTRAINT IF EXISTS "user_reports_target_type_check";
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_target_type_check" CHECK (
  ("target_type" = 'product' AND "product_id" IS NOT NULL AND "shop_id" IS NULL AND "chat_conversation_id" IS NULL AND "chat_message_id" IS NULL AND "reported_user_id" IS NULL) OR
  ("target_type" = 'shop' AND "shop_id" IS NOT NULL AND "product_id" IS NULL AND "chat_conversation_id" IS NULL AND "chat_message_id" IS NULL AND "reported_user_id" IS NULL) OR
  ("target_type" = 'chat_conversation' AND "chat_conversation_id" IS NOT NULL AND "product_id" IS NULL AND "shop_id" IS NULL AND "chat_message_id" IS NULL AND "reported_user_id" IS NOT NULL) OR
  ("target_type" = 'chat_message' AND "chat_conversation_id" IS NOT NULL AND "chat_message_id" IS NOT NULL AND "product_id" IS NULL AND "shop_id" IS NULL AND "reported_user_id" IS NOT NULL)
);
ALTER TABLE "moderation_cases" DROP CONSTRAINT IF EXISTS "moderation_cases_target_type_check";
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_target_type_check" CHECK (
  ("target_type" = 'product' AND "product_id" IS NOT NULL AND "shop_id" IS NULL AND "chat_conversation_id" IS NULL AND "reported_user_id" IS NULL) OR
  ("target_type" = 'shop' AND "shop_id" IS NOT NULL AND "product_id" IS NULL AND "chat_conversation_id" IS NULL AND "reported_user_id" IS NULL) OR
  ("target_type" IN ('chat_conversation', 'chat_message') AND "chat_conversation_id" IS NOT NULL AND "product_id" IS NULL AND "shop_id" IS NULL AND "reported_user_id" IS NOT NULL)
);

ALTER TABLE "chat_user_messages" ADD CONSTRAINT "chat_user_messages_reply_fkey"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "chat_user_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_chat_conversation_fkey"
  FOREIGN KEY ("chat_conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_chat_message_fkey"
  FOREIGN KEY ("chat_message_id") REFERENCES "chat_user_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_fkey"
  FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_chat_conversation_fkey"
  FOREIGN KEY ("chat_conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_reported_user_fkey"
  FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "chat_user_messages_reply_idx" ON "chat_user_messages" ("reply_to_message_id");
CREATE INDEX IF NOT EXISTS "user_reports_chat_target_idx" ON "user_reports" ("chat_conversation_id", "reported_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_reports_chat_message_idx" ON "user_reports" ("chat_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_reports_active_reporter_chat_conversation_unique_idx"
  ON "user_reports" ("reporter_user_id", "chat_conversation_id")
  WHERE "status" = 'submitted' AND "target_type" = 'chat_conversation';
CREATE UNIQUE INDEX IF NOT EXISTS "user_reports_active_reporter_chat_message_unique_idx"
  ON "user_reports" ("reporter_user_id", "chat_message_id")
  WHERE "status" = 'submitted' AND "target_type" = 'chat_message';
CREATE INDEX IF NOT EXISTS "moderation_cases_chat_target_idx" ON "moderation_cases" ("chat_conversation_id", "reported_user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "moderation_cases_active_chat_target_unique_idx"
  ON "moderation_cases" ("chat_conversation_id", "reported_user_id")
  WHERE "status" <> 'resolved' AND "target_type" IN ('chat_conversation', 'chat_message');

CREATE INDEX IF NOT EXISTS "notifications_recipient_category_activity_idx"
  ON "notifications" ("recipient_id", "category", "is_archived", "activity_at" DESC, "id");
