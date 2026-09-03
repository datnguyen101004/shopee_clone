import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NotificationType } from '../src/generated/prisma/enums';

describe('T31 chat safety and notification migration', () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260828100000_t31_chat_safety_notifications/migration.sql',
    ),
    'utf8',
  );

  it('backfills notification ordering without rewriting existing message state', () => {
    expect(migration).toContain('UPDATE "notifications" SET "activity_at" = "created_at"');
    expect(migration).toContain('ALTER COLUMN "activity_at" SET NOT NULL');
    expect(migration).not.toContain('DELETE FROM "chat_user_messages"');
    expect(migration).not.toContain('DELETE FROM "chat_user_memberships"');
  });

  it('declares target, block, rate, attention, and aggregate safeguards', () => {
    expect(migration).toContain('chat_user_blocks_distinct_check');
    expect(migration).toContain('chat_rate_limit_events_scope_subject_check');
    expect(migration).toContain('chat_attention_leases_expiry_check');
    expect(migration).toContain('user_reports_target_type_check');
    expect(migration).toContain('moderation_cases_target_type_check');
    expect(migration).toContain('moderation_cases_active_chat_target_unique_idx');
    expect(migration).toContain('user_reports_active_reporter_chat_conversation_unique_idx');
    expect(migration).toContain('user_reports_active_reporter_chat_message_unique_idx');
    expect(migration).toContain('notifications_recipient_category_activity_idx');
  });

  it('keeps chat report evidence bounded to the declared relational anchors', () => {
    expect(migration).toContain('"chat_conversation_id" UUID');
    expect(migration).toContain('"chat_message_id" UUID');
    expect(migration).toContain('"reported_user_id" UUID');
    expect(migration).toContain('chat_user_messages_reply_idx');
    expect(migration).toContain('ON DELETE SET NULL');
  });

  it('keeps the generated client and follow-up enum migration in sync', () => {
    const enumMigration = readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20260828110000_t31_chat_notification_type/migration.sql'),
      'utf8',
    );
    expect(NotificationType.CHAT_MESSAGE).toBe('CHAT_MESSAGE');
    expect(enumMigration).toContain('ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS \'chat_message\'');
    expect(enumMigration).toContain('forward-only');
  });

  it('keeps the legacy-data preflight gate explicit and non-destructive', () => {
    const preflight = readFileSync(path.join(process.cwd(), 'prisma/preflight-chat-foundation.ts'), 'utf8');
    expect(preflight).toContain('legacyTablesPresent');
    expect(preflight).toContain('invalidMemberships');
    expect(preflight).not.toContain('deleteMany');
    expect(preflight).not.toContain('DELETE FROM');
  });
});
