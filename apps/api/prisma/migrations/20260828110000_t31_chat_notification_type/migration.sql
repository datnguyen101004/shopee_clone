-- T31 follow-up: enable the reserved CHAT_MESSAGE notification type.
-- Keep this forward-only so already-applied migrations retain their checksums.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'chat_message';
