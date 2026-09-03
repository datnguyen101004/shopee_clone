-- Legacy chat rows without a message are intentionally not surfaced in the
-- canonical user-to-user inbox. Keep the historical tables untouched.
DELETE FROM "chat_user_conversations"
WHERE "last_message_sequence" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "chat_user_messages" m
    WHERE m."conversation_id" = "chat_user_conversations"."id"
  );
