-- Change 1 chat persistence. The historical chat foundation is intentionally
-- left intact; this migration introduces the canonical user-to-user model.
BEGIN;

CREATE TYPE "chat_user_outbox_status" AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE "chat_user_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_low_user_id" UUID NOT NULL,
  "participant_high_user_id" UUID NOT NULL,
  "next_sequence" INTEGER NOT NULL DEFAULT 1,
  "last_message_sequence" INTEGER NOT NULL DEFAULT 0,
  "last_message_preview" VARCHAR(2000),
  "last_message_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_user_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_user_conversations_distinct_participants_check" CHECK ("participant_low_user_id" <> "participant_high_user_id"),
  CONSTRAINT "chat_user_conversations_sequence_check" CHECK ("next_sequence" >= 1 AND "last_message_sequence" >= 0 AND "last_message_sequence" < "next_sequence"),
  CONSTRAINT "chat_user_conversations_low_user_fkey" FOREIGN KEY ("participant_low_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "chat_user_conversations_high_user_fkey" FOREIGN KEY ("participant_high_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "chat_user_conversations_participants_key" ON "chat_user_conversations" ("participant_low_user_id", "participant_high_user_id");
CREATE INDEX "chat_user_conversations_low_order_idx" ON "chat_user_conversations" ("participant_low_user_id", "last_message_at" DESC, "id");
CREATE INDEX "chat_user_conversations_high_order_idx" ON "chat_user_conversations" ("participant_high_user_id", "last_message_at" DESC, "id");

CREATE TABLE "chat_user_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "last_read_sequence" INTEGER NOT NULL DEFAULT 0,
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "last_read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_user_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_user_memberships_state_check" CHECK ("last_read_sequence" >= 0 AND "unread_count" >= 0),
  CONSTRAINT "chat_user_memberships_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_user_memberships_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "chat_user_memberships_conversation_user_key" ON "chat_user_memberships" ("conversation_id", "user_id");
CREATE INDEX "chat_user_memberships_user_order_idx" ON "chat_user_memberships" ("user_id", "updated_at" DESC, "conversation_id");

CREATE TABLE "chat_user_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "sender_user_id" UUID NOT NULL,
  "client_message_id" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_user_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_user_messages_content_check" CHECK (length(trim("content")) >= 1 AND length("content") <= 2000),
  CONSTRAINT "chat_user_messages_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "chat_user_messages_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_user_messages_sender_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "chat_user_messages_conversation_sequence_key" ON "chat_user_messages" ("conversation_id", "sequence");
CREATE UNIQUE INDEX "chat_user_messages_idempotency_key" ON "chat_user_messages" ("conversation_id", "sender_user_id", "client_message_id");
CREATE INDEX "chat_user_messages_history_idx" ON "chat_user_messages" ("conversation_id", "sequence" DESC);
CREATE INDEX "chat_user_messages_sender_idx" ON "chat_user_messages" ("sender_user_id", "created_at" DESC);

CREATE TABLE "chat_user_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "message_id" UUID,
  "recipient_user_id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "deduplication_key" VARCHAR(240) NOT NULL,
  "status" "chat_user_outbox_status" NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3),
  "locked_until" TIMESTAMPTZ(3),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_user_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_user_outbox_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_user_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_user_outbox_message_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_user_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_user_outbox_recipient_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "chat_user_outbox_deduplication_key" ON "chat_user_outbox" ("deduplication_key");
CREATE INDEX "chat_user_outbox_claim_idx" ON "chat_user_outbox" ("status", "next_attempt_at", "created_at");
CREATE INDEX "chat_user_outbox_recipient_idx" ON "chat_user_outbox" ("recipient_user_id", "created_at");

-- Convert valid rows from the historical buyer/shop tables when those tables
-- exist. Ambiguous data stops the migration rather than losing messages.
DO $$
BEGIN
  IF to_regclass('public.chat_conversations') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM chat_conversations c
      LEFT JOIN shops s ON s.id = c.shop_id
      WHERE s.id IS NULL OR c.buyer_id = s.owner_id
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile legacy chat conversations with missing owners or self-pairs';
    END IF;

    IF EXISTS (
      SELECT c.buyer_id, s.owner_id
      FROM chat_conversations c
      JOIN shops s ON s.id = c.shop_id
      GROUP BY c.buyer_id, s.owner_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile duplicate legacy chat user pairs';
    END IF;

    IF to_regclass('public.chat_messages') IS NOT NULL AND EXISTS (
      SELECT conversation_id, sender_user_id, client_message_id
      FROM chat_messages
      GROUP BY conversation_id, sender_user_id, client_message_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile duplicate legacy client message ids';
    END IF;

    IF to_regclass('public.chat_memberships') IS NOT NULL AND EXISTS (
      SELECT conversation_id
      FROM chat_memberships
      GROUP BY conversation_id
      HAVING count(*) <> 2 OR count(DISTINCT user_id) <> 2
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile invalid legacy chat memberships';
    END IF;


    IF EXISTS (
      SELECT 1
      FROM chat_conversations c
      LEFT JOIN chat_memberships m ON m.conversation_id = c.id
      WHERE c.next_sequence < 1
         OR c.last_message_sequence < 0
         OR c.last_message_sequence >= c.next_sequence
         OR m.last_read_sequence < 0
         OR m.last_read_sequence > c.last_message_sequence
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile invalid legacy chat sequence or read state';
    END IF;


    INSERT INTO chat_user_conversations (
      id, participant_low_user_id, participant_high_user_id, next_sequence,
      last_message_sequence, last_message_preview, last_message_at, created_at, updated_at
    )
    SELECT
      c.id,
      CASE WHEN c.buyer_id < s.owner_id THEN c.buyer_id ELSE s.owner_id END,
      CASE WHEN c.buyer_id < s.owner_id THEN s.owner_id ELSE c.buyer_id END,
      c.next_sequence,
      c.last_message_sequence,
      c.last_message_preview,
      c.last_message_at,
      c.created_at,
      c.updated_at
    FROM chat_conversations c
    JOIN shops s ON s.id = c.shop_id;

    IF to_regclass('public.chat_messages') IS NOT NULL THEN
      INSERT INTO chat_user_messages (id, conversation_id, sequence, sender_user_id, client_message_id, request_digest, content, created_at)
      SELECT id, conversation_id, sequence, sender_user_id, client_message_id, request_digest, content, created_at
      FROM chat_messages;
    END IF;

    IF to_regclass('public.chat_memberships') IS NOT NULL THEN
      INSERT INTO chat_user_memberships (id, conversation_id, user_id, last_read_sequence, last_read_at, unread_count, created_at, updated_at)
      SELECT
        m.id,
        m.conversation_id,
        m.user_id,
        m.last_read_sequence,
        m.last_read_at,
        CASE WHEN m.role::text = 'buyer' THEN legacy.buyer_unread_count ELSE legacy.shop_unread_count END,
        m.created_at,
        m.updated_at
      FROM chat_memberships m
      JOIN chat_conversations legacy ON legacy.id = m.conversation_id
      JOIN chat_user_conversations c ON c.id = m.conversation_id;
    END IF;

    INSERT INTO chat_user_memberships (conversation_id, user_id, last_read_sequence, unread_count)
    SELECT c.id, c.participant_low_user_id, 0, 0 FROM chat_user_conversations c
    WHERE NOT EXISTS (SELECT 1 FROM chat_user_memberships m WHERE m.conversation_id = c.id AND m.user_id = c.participant_low_user_id);
    INSERT INTO chat_user_memberships (conversation_id, user_id, last_read_sequence, unread_count)
    SELECT c.id, c.participant_high_user_id, 0, 0 FROM chat_user_conversations c
    WHERE NOT EXISTS (SELECT 1 FROM chat_user_memberships m WHERE m.conversation_id = c.id AND m.user_id = c.participant_high_user_id);
  END IF;
END $$;

COMMIT;
