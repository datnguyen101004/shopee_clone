-- Reconstructed from the applied local database schema because the original
-- migration source was no longer present in repository history.
BEGIN;

CREATE TYPE "chat_attachment_state" AS ENUM ('pending_upload', 'staged', 'attached', 'expired');
CREATE TYPE "chat_message_type" AS ENUM ('text', 'image', 'product', 'order');
CREATE TYPE "chat_outbox_status" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "chat_participant_role" AS ENUM ('buyer', 'seller');
CREATE TYPE "chat_report_reason" AS ENUM ('spam', 'harassment', 'scam', 'inappropriate', 'other');
CREATE TYPE "chat_sender_side" AS ENUM ('buyer', 'seller');

CREATE TABLE "chat_conversations" (
  "id" UUID NOT NULL,
  "buyer_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "next_sequence" INTEGER NOT NULL DEFAULT 1,
  "last_message_sequence" INTEGER NOT NULL DEFAULT 0,
  "last_message_preview" VARCHAR(2000),
  "last_message_at" TIMESTAMPTZ(3),
  "last_message_sender_side" "chat_sender_side",
  "buyer_last_read_sequence" INTEGER NOT NULL DEFAULT 0,
  "shop_last_read_sequence" INTEGER NOT NULL DEFAULT 0,
  "buyer_unread_count" INTEGER NOT NULL DEFAULT 0,
  "shop_unread_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_conversations_sequences_check" CHECK (
    "next_sequence" >= 1
    AND "last_message_sequence" >= 0
    AND "buyer_last_read_sequence" >= 0
    AND "shop_last_read_sequence" >= 0
    AND "buyer_unread_count" >= 0
    AND "shop_unread_count" >= 0
    AND "buyer_last_read_sequence" <= "last_message_sequence"
    AND "shop_last_read_sequence" <= "last_message_sequence"
  ),
  CONSTRAINT "chat_conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "chat_conversations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_memberships" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "chat_participant_role" NOT NULL,
  "last_read_sequence" INTEGER NOT NULL DEFAULT 0,
  "last_read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "sender_user_id" UUID NOT NULL,
  "sender_side" "chat_sender_side" NOT NULL,
  "client_message_id" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_messages_content_check" CHECK (length("content") >= 1 AND length("content") <= 2000),
  CONSTRAINT "chat_messages_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_attachments" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "uploader_user_id" UUID NOT NULL,
  "message_id" UUID,
  "storage_key" VARCHAR(255) NOT NULL,
  "state" "chat_attachment_state" NOT NULL,
  "mime_type" VARCHAR(32) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "checksum_sha256" VARCHAR(64) NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "upload_expires_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_attachments_uploader_user_id_fkey" FOREIGN KEY ("uploader_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_blocks" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "blocker_user_id" UUID NOT NULL,
  "blocked_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "chat_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_report_references" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "reporter_user_id" UUID NOT NULL,
  "message_id" UUID,
  "idempotency_key" UUID NOT NULL,
  "reason" "chat_report_reason" NOT NULL,
  "note" VARCHAR(500),
  "evidence_digest" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_report_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_report_references_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_outbox" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "deduplication_key" VARCHAR(240) NOT NULL,
  "status" "chat_outbox_status" NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_outbox_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "chat_conversations_buyer_id_shop_id_key" ON "chat_conversations"("buyer_id", "shop_id");
CREATE INDEX "chat_conversations_buyer_id_last_message_at_id_idx" ON "chat_conversations"("buyer_id", "last_message_at" DESC, "id");
CREATE INDEX "chat_conversations_shop_id_last_message_at_id_idx" ON "chat_conversations"("shop_id", "last_message_at" DESC, "id");
CREATE INDEX "chat_conversations_buyer_id_buyer_unread_count_last_message_at_" ON "chat_conversations"("buyer_id", "buyer_unread_count", "last_message_at" DESC, "id");
CREATE INDEX "chat_conversations_shop_id_shop_unread_count_last_message_at_id" ON "chat_conversations"("shop_id", "shop_unread_count", "last_message_at" DESC, "id");

CREATE UNIQUE INDEX "chat_memberships_conversation_id_user_id_key" ON "chat_memberships"("conversation_id", "user_id");
CREATE INDEX "chat_memberships_user_id_updated_at_conversation_id_idx" ON "chat_memberships"("user_id", "updated_at" DESC, "conversation_id");

CREATE UNIQUE INDEX "chat_messages_conversation_id_sequence_key" ON "chat_messages"("conversation_id", "sequence");
CREATE UNIQUE INDEX "chat_messages_conversation_id_sender_side_client_message_id_key" ON "chat_messages"("conversation_id", "sender_side", "client_message_id");
CREATE INDEX "chat_messages_conversation_id_sequence_idx" ON "chat_messages"("conversation_id", "sequence" DESC);
CREATE INDEX "chat_messages_sender_user_id_created_at_idx" ON "chat_messages"("sender_user_id", "created_at");

CREATE UNIQUE INDEX "chat_attachments_message_id_key" ON "chat_attachments"("message_id");
CREATE UNIQUE INDEX "chat_attachments_storage_key_key" ON "chat_attachments"("storage_key");
CREATE INDEX "chat_attachments_conversation_id_state_upload_expires_at_idx" ON "chat_attachments"("conversation_id", "state", "upload_expires_at");
CREATE INDEX "chat_attachments_uploader_user_id_state_upload_expires_at_idx" ON "chat_attachments"("uploader_user_id", "state", "upload_expires_at");

CREATE UNIQUE INDEX "chat_blocks_conversation_id_blocker_user_id_key" ON "chat_blocks"("conversation_id", "blocker_user_id");
CREATE INDEX "chat_blocks_conversation_id_blocked_user_id_idx" ON "chat_blocks"("conversation_id", "blocked_user_id");

CREATE UNIQUE INDEX "chat_report_references_reporter_user_id_idempotency_key_key" ON "chat_report_references"("reporter_user_id", "idempotency_key");
CREATE INDEX "chat_report_references_conversation_id_created_at_idx" ON "chat_report_references"("conversation_id", "created_at" DESC);

CREATE UNIQUE INDEX "chat_outbox_deduplication_key_key" ON "chat_outbox"("deduplication_key");
CREATE INDEX "chat_outbox_conversation_id_created_at_idx" ON "chat_outbox"("conversation_id", "created_at");
CREATE INDEX "chat_outbox_status_next_retry_at_created_at_idx" ON "chat_outbox"("status", "next_retry_at", "created_at");

COMMIT;
